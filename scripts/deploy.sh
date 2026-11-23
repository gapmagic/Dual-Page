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
npx wrangler deploy
