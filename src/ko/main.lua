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
local Device = require("device")
local ConfirmBox = require("ui/widget/confirmbox")
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
    if self.ui.highlight then
        self.ui.highlight:addToHighlightDialog("12_dualpage_share", function(this)
            return {
                text = "Chia sẻ Dual Page",
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

function DualPage:onReaderReady()
    self.start_pct = self:getPercent()
    self.last_turn = os.time()
    self.active = 0
    self.last_push = os.time()
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
            UIManager:show(Notification:new{ text = "Đã chia sẻ tới màn hình chờ của bạn đọc." })
            self:refreshScreen()
        else
            self:queue("clips", payload)
            UIManager:show(InfoMessage:new{ text = "Chưa gửi được. Dual Page sẽ gửi lại khi có mạng.", timeout = 3 })
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
    if on then
        if not self:isScreensaverOn() then
            self.store:saveSetting("prev_type", G_reader_settings:readSetting("screensaver_type"))
            self.store:saveSetting("prev_dir", G_reader_settings:readSetting("screensaver_dir"))
            self.store:flush()
        end
        G_reader_settings:saveSetting("screensaver_type", "random_image")
        G_reader_settings:saveSetting("screensaver_dir", self.screen_dir)
        NetworkMgr:runWhenOnline(function()
            local ok = self:refreshScreen()
            UIManager:show(InfoMessage:new{
                text = ok and "Đã bật. Cho máy ngủ để xem màn hình chờ Dual Page."
                    or "Đã bật, nhưng chưa tải được ảnh. Ảnh sẽ được tải khi có mạng.",
                timeout = 4,
            })
        end)
    else
        G_reader_settings:saveSetting("screensaver_type", self.store:readSetting("prev_type") or "disable")
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
                text = "Mở Dual Page",
                callback = function() self:showHome() end,
            },
            {
                text = "Dùng màn hình chờ Dual Page",
                checked_func = function() return self:isScreensaverOn() end,
                callback = function() self:setScreensaver(not self:isScreensaverOn()) end,
            },
            {
                text = "Gửi tiến độ và cập nhật màn hình chờ",
                callback = function()
                    NetworkMgr:runWhenOnline(function()
                        self:pushSession()
                        UIManager:show(Notification:new{ text = "Đã cập nhật Dual Page." })
                    end)
                end,
            },
        },
    }
end

function DualPage:openMenu(items)
    local menu
    menu = Menu:new{
        title = "Dual Page",
        item_table = items,
        covers_fullscreen = true,
        is_borderless = true,
        is_popout = false,
        close_callback = function() UIManager:close(menu) end,
    }
    UIManager:show(menu)
end

function DualPage:showHome()
    NetworkMgr:runWhenOnline(function()
        -- Send what was just read first, so the status is current.
        if self.ui.document and self.start_pct then
            local body = self:takeSession()
            if body then self:queue("sessions", body) end
        end
        self:flushQueues()
        local res = request("GET", "home")
        local ok, data = pcall(json.decode, res or "")
        if not (ok and type(data) == "table" and type(data.items) == "table") then
            UIManager:show(InfoMessage:new{ text = "Không kết nối được Dual Page. Kiểm tra Wi-Fi rồi thử lại." })
            return
        end
        local items = {}
        for _, it in ipairs(data.items) do
            local id, title, sub = tostring(it.id or "info"), tostring(it.title or ""), tostring(it.author or "")
            table.insert(items, {
                text = title,
                callback = function() self:onItem(id, title, sub) end,
            })
        end
        self.items = items
        self:openMenu(items)
        self:refreshScreen()
    end)
end

function DualPage:onItem(id, title, sub)
    if id == "info" then
        UIManager:show(InfoMessage:new{
            text = sub ~= "" and (title .. "\n\n" .. sub) or title,
            dismiss_callback = function() self:openMenu(self.items) end,
        })
    elseif id:match("%.dp$") then
        local res = request("GET", "act/" .. util.urlEncode(id))
        UIManager:show(InfoMessage:new{
            text = res and util.trim(res) or "Không gửi được, thử lại sau.",
            timeout = 3,
            dismiss_callback = function() self:showHome() end,
        })
    else
        self:downloadBook(id)
    end
end

function DualPage:downloadBook(name)
    local home = G_reader_settings:readSetting("home_dir") or Device.home_dir or DataStorage:getDataDir()
    local dir = home .. "/DualPage"
    util.makePath(dir)
    local dest = dir .. "/" .. name
    UIManager:show(InfoMessage:new{ text = "Đang tải sách chung…", timeout = 1 })
    UIManager:scheduleIn(1, function()
        local ok = request("GET", "act/" .. util.urlEncode(name), nil, nil, dest)
        if not ok then
            UIManager:show(InfoMessage:new{ text = "Tải sách không thành công." })
            return
        end
        UIManager:show(ConfirmBox:new{
            text = "Đã lưu vào " .. dest .. "\n\nMở sách ngay?",
            ok_text = "Mở",
            ok_callback = function()
                local ReaderUI = require("apps/reader/readerui")
                ReaderUI:showReader(dest)
            end,
        })
    end)
end

return DualPage
