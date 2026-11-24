--[[
Dual Page for KOReader (Kindle, Kobo, PocketBook, Android...).
Same rooms as the XTeink/CrossPoint plugin: https://dualpage.online

- Reading progress of the open book is sent after reading (page turns, closing the book, sleep).
- New highlights are sent to Dual Page; the newest one shows on the partner's sleep screen.
  "Chia sẻ Dual Page" in the highlight popup shares any selected text right away.
- Main menu > Dual Page: status, nudge, extension, share older highlights, download the shared book.
- Optional: use the Dual Page status image as KOReader's sleep screen.
]]

local DataStorage = require("datastorage")
local Dispatcher = require("dispatcher")
local Device = require("device")
local ConfirmBox = require("ui/widget/confirmbox")
local Event = require("ui/event")
local InfoMessage = require("ui/widget/infomessage")
local LuaSettings = require("luasettings")
local Menu = require("ui/widget/menu")
local NetworkMgr = require("ui/network/manager")
local Notification = require("ui/widget/notification")
local UIManager = require("ui/uimanager")
local WidgetContainer = require("ui/widget/container/widgetcontainer")
local logger = require("logger")
local util = require("util")
local md5 = require("ffi/sha2").md5
local ltn12 = require("ltn12")
local socketutil = require("socketutil")
local http = require("socket.http")
local https = require("ssl.https")
local cfg = require("dualpage_config")
local EN = cfg.lang == "en"
local function L(vi, en) if EN then return en end return vi end

local json
do
    local ok, rj = pcall(require, "rapidjson")
    json = ok and rj or require("json")
end

local IDLE_GAP = 600      -- seconds without a page turn that no longer count as reading
local PUSH_EVERY = 600    -- push progress at most this often while reading
local PUSH_DELAY = 15     -- wait this long after a page turn before pushing

local function request(method, path, body, ctype, dest)
    local url = cfg.server .. "/d/" .. cfg.token .. "/" .. path
    local requester = url:match("^https:") and https or http
    local headers = { ["user-agent"] = socketutil.USER_AGENT }
    if body then
        headers["content-type"] = ctype or "application/x-www-form-urlencoded"
        headers["content-length"] = tostring(#body)
    end
    local chunks, sink, tmp = {}, nil, nil
    if dest then
        tmp = dest .. ".part"
        local fh = io.open(tmp, "wb")
        if not fh then return nil end
        sink = ltn12.sink.file(fh)
    else
        sink = ltn12.sink.table(chunks)
    end
    if dest then
        socketutil:set_timeout(socketutil.FILE_BLOCK_TIMEOUT, socketutil.FILE_TOTAL_TIMEOUT)
    else
        socketutil:set_timeout(5, 15)
    end
    local ok, code = pcall(function()
        local _, c = requester.request{
            url = url,
            method = method,
            headers = headers,
            source = body and ltn12.source.string(body) or nil,
            sink = sink,
        }
        return c
    end)
    socketutil:reset_timeout()
    if not ok or code ~= 200 then
        logger.warn("DualPage:", method, path, "failed:", code)
        if tmp then os.remove(tmp) end
        return nil, code
    end
    if dest then
        os.remove(dest)
        os.rename(tmp, dest)
        return true
    end
    return table.concat(chunks), code
end

local DualPage = WidgetContainer:extend{
    name = "dualpage",
    is_doc_only = false,
}

function DualPage:init()
    math.randomseed(os.time())
    self.dir = DataStorage:getDataDir() .. "/dualpage"
    self.screen_dir = self.dir .. "/screen"
    util.makePath(self.screen_dir)
    self.store = LuaSettings:open(self.dir .. "/state.lua")
    self.ui.menu:registerToMainMenu(self)
    self:onDispatcherRegisterActions()
    if self.ui.highlight then
        self.ui.highlight:addToHighlightDialog("12_dualpage_share", function(this)
            return {
                text = L("Chia sẻ Dual Page", "Share to Dual Page"),
                callback = function()
                    local text = util.cleanupSelectedText(this.selected_text.text)
                    this:onClose()
                    self:shareText(text)
                end,
            }
        end)
    end
end

-- ---------- progress ----------

function DualPage:getPercent()
    local ui = self.ui
    if not ui.document then return end
    local ok, p = pcall(function()
        if ui.document.info.has_pages then
            return ui.paging:getLastPercent()
        end
        return ui.rolling:getLastPercent()
    end)
    if ok and type(p) == "number" then return p end
end

function DualPage:getDigest()
    if not (self.ui.document and self.ui.doc_settings) then return end
    return self.ui.doc_settings:readSetting("partial_md5_checksum") or util.partialMD5(self.ui.document.file)
end

-- Lets Gesture manager (tap/long-press corners, swipes...) open Dual Page.
-- Listed under General, near the end of the list (plugin actions come last).
function DualPage:onDispatcherRegisterActions()
    Dispatcher:registerAction("dualpage_open", {
        category = "none",
        event = "DualPageOpen",
        title = "Dual Page",
        general = true,
        separator = true,
    })
end

function DualPage:onDualPageOpen()
    self:showHome()
    return true
end

function DualPage:onReaderReady()
    self.start_pct = self:getPercent()
    self.last_turn = os.time()
    self.active = 0
    self.last_push = os.time()
    -- A fresh copy of the shared book (deleted, then downloaded again) opens at
    -- the start: offer to jump back to where this reader got to.
    if (self.start_pct or 0) < 0.01 and NetworkMgr:isConnected() then
        UIManager:scheduleIn(1, function() self:offerResume() end)
    end
end

function DualPage:offerResume()
    local doc = self:getDigest()
    if not doc then return end
    local res = request("GET", "resume?doc=" .. doc)
    local ok, data = pcall(json.decode, res or "")
    local pct = ok and type(data) == "table" and tonumber(data.pct)
    if not pct or pct < 1 or not self.ui.document then return end
    local cur = (self:getPercent() or 0) * 100
    if cur + 1 >= pct then return end
    local shown = pct >= 10 and string.format("%d", math.floor(pct)) or string.format("%.1f", pct)
    UIManager:show(ConfirmBox:new{
        text = L("Bạn đã đọc tới " .. shown .. "% cuốn này. Mở tiếp từ chỗ đó?", "You got to " .. shown .. "% of this book. Continue from there?"),
        ok_text = L("Đọc tiếp", "Continue"),
        cancel_text = L("Ở lại đây", "Stay here"),
        ok_callback = function()
            self.ui:handleEvent(Event:new("GotoPercent", pct))
            self.start_pct = self:getPercent()
        end,
    })
end

function DualPage:onPageUpdate()
    if not self.start_pct then return end
    local t = os.time()
    if self.last_turn and t - self.last_turn < IDLE_GAP then
        self.active = (self.active or 0) + (t - self.last_turn)
    end
    self.last_turn = t
    if t - (self.last_push or 0) >= PUSH_EVERY and NetworkMgr:isConnected() then
        if self.push_task then UIManager:unschedule(self.push_task) end
        self.push_task = function()
            self.push_task = nil
            if NetworkMgr:isConnected() then self:pushSession() end
        end
        UIManager:scheduleIn(PUSH_DELAY, self.push_task)
    end
end

-- Builds the same body the CrossPoint plugin sends, and resets the counters.
function DualPage:takeSession()
    if not (self.ui.document and self.start_pct) then return end
    local pct = self:getPercent()
    if not pct then return end
    local t = os.time()
    if self.last_turn and t - self.last_turn < IDLE_GAP then
        self.active = (self.active or 0) + (t - self.last_turn)
        self.last_turn = t
    end
    local body = table.concat({
        "id=ko-" .. t .. "-" .. math.random(100000, 999999),
        "doc=" .. (self:getDigest() or ""),
        "sbp=" .. math.floor(self.start_pct * 10000 + 0.5),
        "ebp=" .. math.floor(pct * 10000 + 0.5),
        "dur=" .. math.floor(self.active or 0),
        "end=" .. t,
        "book=" .. util.urlEncode(self.ui.document.file),
    }, "&")
    self.start_pct = pct
    self.active = 0
    return body
end

function DualPage:queue(kind, entry)
    local q = self.store:readSetting(kind) or {}
    table.insert(q, entry)
    while #q > 50 do table.remove(q, 1) end
    self.store:saveSetting(kind, q)
    self.store:flush()
end

function DualPage:flushQueues()
    for _, kind in ipairs({ "sessions", "clips" }) do
        local q = self.store:readSetting(kind) or {}
        local left = {}
        for _, entry in ipairs(q) do
            local ok
            if kind == "sessions" then
                ok = request("POST", "session", entry)
            else
                ok = request("POST", "highlight", json.encode(entry), "application/json")
            end
            if not ok then table.insert(left, entry) end
        end
        self.store:saveSetting(kind, left)
    end
    self.store:flush()
end

function DualPage:pushSession()
    local body = self:takeSession()
    self.last_push = os.time()
    if body then self:queue("sessions", body) end
    self:flushQueues()
    self:refreshScreen()
end

function DualPage:onCloseDocument()
    local body = self:takeSession()
    if body then self:queue("sessions", body) end
    self.start_pct = nil
    if NetworkMgr:isConnected() then
        self:flushQueues()
        self:refreshScreen()
    end
end

function DualPage:onSuspend()
    -- KOReader draws the sleep screen before this event, so the image fetched
    -- here is the one shown next time. It is also refreshed while reading.
    local body = self:takeSession()
    if body then self:queue("sessions", body) end
    if NetworkMgr:isConnected() then
        self:flushQueues()
        self:refreshScreen()
    end
end

function DualPage:onNetworkConnected()
    UIManager:scheduleIn(2, function()
        if self.ui.document and self.start_pct then
            local body = self:takeSession()
            if body then self:queue("sessions", body) end
        end
        self:flushQueues()
        self:refreshScreen()
    end)
end

-- ---------- highlights ----------

function DualPage:onAnnotationsModified(items)
    if type(items) ~= "table" or not items.nb_highlights_added or items.nb_highlights_added == 0 then return end
    local item = items[1]
    if type(item) ~= "table" or not item.text or item.text == "" then return end
    local clip = {
        id = md5((item.datetime or "") .. "|" .. item.text):sub(1, 32),
        text = item.text,
        chapter = item.chapter,
        created_at = os.time(),
    }
    if items.nb_highlights_added < 0 then clip.deleted = 1 end
    self:queue("clips", { doc = self:getDigest(), items = { clip } })
    if NetworkMgr:isConnected() then
        UIManager:scheduleIn(1, function() self:flushQueues() end)
    end
end

function DualPage:shareText(text)
    if not text or text == "" then return end
    local payload = {
        doc = self:getDigest(),
        items = { { id = md5("share|" .. text):sub(1, 32), text = text, created_at = os.time(), share = 1 } },
    }
    NetworkMgr:runWhenOnline(function()
        local res = request("POST", "highlight", json.encode(payload), "application/json")
        if res then
            UIManager:show(Notification:new{ text = L("Đã chia sẻ tới màn hình chờ của bạn đọc.", "Shared to your partner's sleep screen.") })
            self:refreshScreen()
        else
            self:queue("clips", payload)
            UIManager:show(InfoMessage:new{ text = L("Chưa gửi được. Dual Page sẽ gửi lại khi có mạng.", "Not sent yet. Dual Page will retry when online."), timeout = 3 })
        end
    end)
end

-- ---------- sleep screen ----------

function DualPage:screenFile()
    return self.screen_dir .. "/dualpage.png"
end

function DualPage:refreshScreen()
    local w, h = Device.screen:getWidth(), Device.screen:getHeight()
    local path = string.format("sleep.png?w=%d&h=%d", math.min(w, h), math.max(w, h))
    return request("GET", path, nil, nil, self:screenFile())
end

function DualPage:isScreensaverOn()
    return G_reader_settings:readSetting("screensaver_type") == "random_image"
        and G_reader_settings:readSetting("screensaver_dir") == self.screen_dir
end

function DualPage:setScreensaver(on)
    -- Ad-supported Kindles ("Special Offers") draw Amazon's ad screen on sleep
    -- and KOReader turns its own screensaver off there, so nothing we save
    -- would show. Say so instead of pretending it worked.
    if on and Device.supportsScreensaver and not Device:supportsScreensaver() then
        UIManager:show(InfoMessage:new{
            text = Device:isKindle()
                and L("Kindle này đang có quảng cáo (Special Offers), nên màn hình chờ luôn là quảng cáo của Amazon và KOReader không thay được. Muốn dùng màn hình chờ Dual Page, hãy gỡ quảng cáo trong tài khoản Amazon (Quản lý nội dung và thiết bị → Thiết bị → Ưu đãi đặc biệt). Tiến độ, highlight và lời nhắc vẫn chạy bình thường.",
                      "This Kindle shows ads (Special Offers), so its sleep screen is always Amazon's ad and KOReader can't replace it. To use the Dual Page sleep screen, remove the ads in your Amazon account (Manage Content & Devices → Devices → Special Offers). Progress, highlights and nudges still work.")
                or L("Máy này không cho KOReader đổi màn hình chờ. Tiến độ, highlight và lời nhắc vẫn chạy bình thường.",
                      "This device doesn't let KOReader change the sleep screen. Progress, highlights and nudges still work."),
        })
        return
    end
    if on then
        if not self:isScreensaverOn() then
            self.store:saveSetting("prev_type", G_reader_settings:readSetting("screensaver_type"))
            self.store:saveSetting("prev_dir", G_reader_settings:readSetting("screensaver_dir"))
            self.store:saveSetting("prev_msg", G_reader_settings:isTrue("screensaver_show_message"))
            self.store:flush()
        end
        G_reader_settings:saveSetting("screensaver_type", "random_image")
        G_reader_settings:saveSetting("screensaver_dir", self.screen_dir)
        -- The Dual Page image already says everything; drop KOReader's "Sleeping" box.
        G_reader_settings:makeFalse("screensaver_show_message")
        NetworkMgr:runWhenOnline(function()
            local ok = self:refreshScreen()
            UIManager:show(InfoMessage:new{
                text = ok and L("Đã bật. Cho máy ngủ để xem màn hình chờ Dual Page.", "On. Put the device to sleep to see the Dual Page screen.")
                    or L("Đã bật, nhưng chưa tải được ảnh. Ảnh sẽ được tải khi có mạng.", "On, but the image could not be downloaded yet. It will be fetched when online."),
                timeout = 4,
            })
        end)
    else
        G_reader_settings:saveSetting("screensaver_type", self.store:readSetting("prev_type") or "disable")
        if self.store:readSetting("prev_msg") then G_reader_settings:makeTrue("screensaver_show_message") end
        local prev_dir = self.store:readSetting("prev_dir")
        if prev_dir then
            G_reader_settings:saveSetting("screensaver_dir", prev_dir)
        else
            G_reader_settings:delSetting("screensaver_dir")
        end
    end
end

-- ---------- menu ----------

function DualPage:addToMainMenu(menu_items)
    menu_items.dualpage = {
        text = "Dual Page",
        sorting_hint = "main",
        sub_item_table = {
            {
                text = L("Mở Dual Page", "Open Dual Page"),
                callback = function() self:showHome() end,
            },
            {
                text = L("Dùng màn hình chờ Dual Page", "Use Dual Page sleep screen"),
                checked_func = function() return self:isScreensaverOn() end,
                callback = function() self:setScreensaver(not self:isScreensaverOn()) end,
            },
            {
                text = L("Gửi tiến độ và cập nhật màn hình chờ", "Send progress and refresh sleep screen"),
                callback = function()
                    NetworkMgr:runWhenOnline(function()
                        self:pushSession()
                        UIManager:show(Notification:new{ text = L("Đã cập nhật Dual Page.", "Dual Page updated.") })
                    end)
                end,
            },
        },
    }
end

function DualPage:openMenu(title, items)
    local menu
    menu = Menu:new{
        title = title,
        item_table = items,
        covers_fullscreen = true,
        is_borderless = true,
        is_popout = false,
        close_callback = function() UIManager:close(menu) end,
    }
    self.open_menus = self.open_menus or {}
    table.insert(self.open_menus, menu)
    UIManager:show(menu)
end

-- Closes every Dual Page menu, then opens the book, so reading starts at once.
-- Opening adds it to KOReader's History, where it stays at the top.
function DualPage:openBook(path)
    for _, m in ipairs(self.open_menus or {}) do UIManager:close(m) end
    self.open_menus = {}
    UIManager:nextTick(function()
        local ReaderUI = require("apps/reader/readerui")
        ReaderUI:showReader(path)
    end)
end

-- Builds the menu rows of one section.
function DualPage:sectionItems(sec)
    local items = {}
    for _, it in ipairs(sec.items or {}) do
        local id, title, sub = tostring(it.id or "info"), tostring(it.title or ""), tostring(it.author or "")
        local row = {
            text = title,
            callback = function() self:onItem(sec, id, title, sub) end,
        }
        if id:match("%.dp$") then row.bold = true end
        table.insert(items, row)
    end
    return items
end

-- Main screen: one row per section ("Hôm nay · Minh nhắc bạn đọc!", "Câu hay"...).
-- open_id opens that section directly (after an action).
function DualPage:showHome(open_id)
    NetworkMgr:runWhenOnline(function()
        -- Send what was just read first, so the status is current.
        if self.ui.document and self.start_pct then
            local body = self:takeSession()
            if body then self:queue("sessions", body) end
        end
        self:flushQueues()
        local res = request("GET", "home?grouped=1")
        local ok, data = pcall(json.decode, res or "")
        if not (ok and type(data) == "table" and type(data.sections) == "table") then
            UIManager:show(InfoMessage:new{ text = L("Không kết nối được Dual Page. Kiểm tra Wi-Fi rồi thử lại.", "Couldn't reach Dual Page. Check Wi-Fi and try again.") })
            return
        end
        if data.lang then EN = data.lang == "en" end
        self.sections = data.sections
        local rows = {}
        for _, sec in ipairs(data.sections) do
            local label = tostring(sec.title or "")
            if sec.note and sec.note ~= "" then label = label .. " · " .. tostring(sec.note) end
            table.insert(rows, {
                text = label,
                bold = true,
                callback = function() self:openMenu("Dual Page · " .. tostring(sec.title or ""), self:sectionItems(sec)) end,
            })
            if open_id and sec.id == open_id then open_id = sec end
        end
        table.insert(rows, {
            text = L("Cập nhật lúc ", "Updated ") .. tostring(data.updated or ""),
            callback = function() self:showHome() end,
        })
        self.home_rows = rows
        if type(open_id) == "table" then
            self:openMenu("Dual Page · " .. tostring(open_id.title or ""), self:sectionItems(open_id))
        else
            self:openMenu("Dual Page", rows)
        end
        self:refreshScreen()
    end)
end

function DualPage:onItem(sec, id, title, sub)
    local back = function() self:openMenu("Dual Page · " .. tostring(sec.title or ""), self:sectionItems(sec)) end
    if id == "info" then
        UIManager:show(InfoMessage:new{
            text = sub ~= "" and (title .. "\n\n" .. sub) or title,
            dismiss_callback = back,
        })
    elseif id == "ext.ask" then
        self:askExtension(sec)
    elseif id:match("%.dp$") then
        local res = request("GET", "act/" .. util.urlEncode(id))
        UIManager:show(InfoMessage:new{
            text = res and util.trim(res) or L("Không gửi được, thử lại sau.", "Couldn't send, try again later."),
            timeout = 3,
            dismiss_callback = function() self:showHome(sec.id) end,
        })
    else
        self:downloadBook(id)
    end
end

-- Custom extension: type a number of days, then send it like the +3/+7 rows.
function DualPage:askExtension(sec)
    local InputDialog = require("ui/widget/inputdialog")
    local dialog
    dialog = InputDialog:new{
        title = L("Gia hạn thêm bao nhiêu ngày? (1–30)", "Extend by how many days? (1–30)"),
        input_type = "number",
        buttons = {{
            { text = L("Huỷ", "Cancel"), id = "close", callback = function() UIManager:close(dialog) end },
            { text = L("Đề nghị", "Propose"), is_enter_default = true, callback = function()
                local n = tonumber(dialog:getInputText())
                UIManager:close(dialog)
                if not n or n < 1 or n > 30 or n ~= math.floor(n) then
                    UIManager:show(InfoMessage:new{ text = L("Nhập số ngày từ 1 đến 30.", "Type a number from 1 to 30."), timeout = 3 })
                    return
                end
                self:onItem(sec, "ext" .. n .. ".dp", "", "")
            end },
        }},
    }
    UIManager:show(dialog)
    dialog:onShowKeyboard()
end

function DualPage:downloadBook(name)
    local lfs = require("libs/libkoreader-lfs")
    local isdir = function(p) return p and lfs.attributes(p, "mode") == "directory" end
    -- KOReader's home folder if the reader set one. Otherwise the device's
    -- books folder: on Kindle that is /mnt/us/documents (KOReader's default
    -- there is /mnt/us, which is not where people look for books).
    local home = G_reader_settings:readSetting("home_dir")
    if not isdir(home) then
        home = nil
        local root = Device.home_dir
        for _, d in ipairs({ root and (root .. "/documents"), root and (root .. "/Documents"), root }) do
            if isdir(d) then home = d break end
        end
        home = home or DataStorage:getDataDir()
    end
    local dest = home .. "/" .. name
    -- Already downloaded (here, or where older versions saved it): just open it.
    if not lfs.attributes(dest, "size") then
        local root = Device.home_dir or home
        for _, old in ipairs({ home .. "/DualPage/" .. name, root .. "/DualPage/" .. name, root .. "/" .. name }) do
            if (lfs.attributes(old, "size") or 0) > 0 then dest = old break end
        end
    end
    local size = lfs.attributes(dest, "size")
    if size and size > 0 then
        if self.ui.document and self.ui.document.file == dest then
            for _, m in ipairs(self.open_menus or {}) do UIManager:close(m) end
            self.open_menus = {}
            return
        end
        return self:openBook(dest)
    end
    UIManager:show(InfoMessage:new{ text = L("Đang tải sách chung…", "Downloading the shared book…"), timeout = 1 })
    UIManager:scheduleIn(1, function()
        local ok = request("GET", "act/" .. util.urlEncode(name), nil, nil, dest)
        if not ok then
            UIManager:show(InfoMessage:new{ text = L("Tải sách không thành công. Không lưu được vào ", "Download failed. Couldn't save to ") .. home })
            return
        end
        UIManager:show(Notification:new{ text = L("Đã lưu: ", "Saved: ") .. dest })
        self:openBook(dest)
    end)
end

return DualPage
