#!/usr/bin/env bash
# Creates the D1 database if needed, applies the schema and deploys the Worker.
# Needs CLOUDFLARE_API_TOKEN (Workers + D1 edit). CLOUDFLARE_ACCOUNT_ID is optional
# when the token can see exactly one account.
set -euo pipefail
cd "$(dirname "$0")/.."
ID=$(npx wrangler d1 list --json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s).find(x=>x.name==="readpal");console.log(r?r.uuid:"")})')
if [ -z "$ID" ]; then
  npx wrangler d1 create readpal >/dev/null
  ID=$(npx wrangler d1 list --json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).find(x=>x.name==="readpal").uuid))')
fi
sed -i.bak "s/^database_id = .*/database_id = \"$ID\"/" wrangler.toml && rm -f wrangler.toml.bak
npx wrangler d1 execute readpal --remote --file schema.sql -y
# Column additions: each runs alone; "duplicate column" means it was applied before.
while IFS= read -r stmt; do
  [ -z "$stmt" ] && continue
  out=$(npx wrangler d1 execute readpal --remote --command "$stmt" -y 2>&1) || echo "$out" | grep -q "duplicate column" || { echo "$out"; exit 1; }
done < migrations.sql

# KV namespace for uploaded shared books.
KV=$(npx wrangler kv namespace list | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s).find(x=>x.title==="dualpage-books");console.log(r?r.id:"")})')
if [ -z "$KV" ]; then
  npx wrangler kv namespace create dualpage-books >/dev/null
  KV=$(npx wrangler kv namespace list | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).find(x=>x.title==="dualpage-books").id))')
fi
sed -i.bak "s/^id = .*/id = \"$KV\"/" wrangler.toml && rm -f wrangler.toml.bak
# A new account has no workers.dev subdomain yet: register one once.
API=https://api.cloudflare.com/client/v4
AUTH="Authorization: Bearer $CLOUDFLARE_API_TOKEN"
ACC=${CLOUDFLARE_ACCOUNT_ID:-$(curl -fsS -H "$AUTH" "$API/accounts" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).result[0].id))')}
SUB=$(curl -sS -H "$AUTH" "$API/accounts/$ACC/workers/subdomain" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).result?.subdomain||"")}catch{console.log("")}})')
if [ -z "$SUB" ]; then
  SUB="dualpage-$(openssl rand -hex 3)"
  curl -fsS -X PUT -H "$AUTH" -H "Content-Type: application/json" -d "{\"subdomain\":\"$SUB\"}" "$API/accounts/$ACC/workers/subdomain" >/dev/null
  echo "Registered $SUB.workers.dev"
fi
npx wrangler deploy
