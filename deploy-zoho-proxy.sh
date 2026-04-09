#!/usr/bin/env bash
# Run this ONCE to deploy the Zoho proxy edge function to Supabase.
# Prerequisites: paste your Supabase personal access token below.
#
# Get your token from: https://supabase.com/dashboard/account/tokens
# (Click "Generate new token", copy it, paste in the line below)

export SUPABASE_ACCESS_TOKEN="sbp_db26785fc26dba25f353dffa6383983b49f44d10"

PROJECT_REF="elfkqmbwuspjaoorqggq"

echo "Setting Zoho secrets on Supabase project $PROJECT_REF..."
npx supabase secrets set \
  ZOHO_CLIENT_ID=1000.12QGCPQN0C0538ZBYCTPB0Y3BJ1I8E \
  ZOHO_CLIENT_SECRET=ca9b3caeb479df74df8dfc1a1c3d07a261230cdd0a \
  ZOHO_REFRESH_TOKEN=1000.e793c4ec7f7bf3be09c0788fc2cde37c.25c0de7d2985cde559f45d4644f5284f \
  --project-ref "$PROJECT_REF"

echo "Deploying zoho-proxy edge function..."
npx supabase functions deploy zoho-proxy \
  --project-ref "$PROJECT_REF" \
  --no-verify-jwt

echo ""
echo "Done! The zoho-proxy function is now live at:"
echo "https://$PROJECT_REF.supabase.co/functions/v1/zoho-proxy"
