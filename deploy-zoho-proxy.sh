#!/usr/bin/env bash
# Run this ONCE to deploy the Zoho proxy edge function to Supabase.
# Prerequisites: paste your Supabase personal access token below.
#
# Get your token from: https://supabase.com/dashboard/account/tokens
# (Click "Generate new token", copy it, paste in the line below)

export SUPABASE_ACCESS_TOKEN="PASTE_YOUR_SUPABASE_PERSONAL_ACCESS_TOKEN_HERE"

PROJECT_REF="elfkqmbwuspjaoorqggq"

echo "Setting Zoho secrets on Supabase project $PROJECT_REF..."
npx supabase secrets set \
  ZOHO_CLIENT_ID=1000.12QGCPQN0C0538ZBYCTPB0Y3BJ1I8E \
  ZOHO_CLIENT_SECRET=ca9b3caeb479df74df8dfc1a1c3d07a261230cdd0a \
  ZOHO_REFRESH_TOKEN=1000.9019d5006daf297238b55dd4bdc14e99.27abdea3598ddb534b471a76d60e3384 \
  --project-ref "$PROJECT_REF"

echo "Deploying zoho-proxy edge function..."
npx supabase functions deploy zoho-proxy \
  --project-ref "$PROJECT_REF" \
  --no-verify-jwt

echo ""
echo "Done! The zoho-proxy function is now live at:"
echo "https://$PROJECT_REF.supabase.co/functions/v1/zoho-proxy"
