import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { validateAdminAuth, unauthorizedResponse } from '@/lib/admin-auth';

/**
 * GET /api/mikrotik/polling/script — Returns a clean RouterOS .rsc script
 * that can be downloaded and imported into the router.
 */
export async function GET(request) {
  if (!(await validateAdminAuth(request))) return unauthorizedResponse();

  try {
    // Get polling config
    const { data: configData } = await supabaseAdmin
      .from('app_settings')
      .select('value')
      .eq('key', 'polling_config')
      .maybeSingle();

    const secret = configData?.value?.secret || 'MISSING_SECRET';
    const interval = configData?.value?.interval || 10;

    // Get the app URL from the request
    const url = new URL(request.url);
    const appUrl = `${url.protocol}//${url.host}/api/mikrotik/polling`;

    const script = generateRouterOSScript(appUrl, secret, interval);

    // Return as plain text with .rsc content type
    return new Response(script, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': 'attachment; filename="asuk-poll-agent.rsc"',
      },
    });
  } catch (error) {
    console.error('Script generation error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

function generateRouterOSScript(appUrl, secret, interval) {
  return `# Asuk Tech Polling Agent for MikroTik RouterOS v7+
# Import this file via WinBox: System > Scripts or /import asuk-poll-agent.rsc

# ---- Remove old script and scheduler if they exist ----
:do { /system scheduler remove [find name="asuk-poll-schedule"] } on-error={}
:do { /system script remove [find name="asuk-poll-agent"] } on-error={}

# ---- Create the polling script ----
/system script add name="asuk-poll-agent" policy=read,write,test,ftp source={
:local fetchUrl "${appUrl}\\?action=fetch&secret=${secret}"
:local postUrl "${appUrl}"
:local mySecret "${secret}"
:do {
/tool fetch url=\$fetchUrl dst-path="asuk-tasks.txt" mode=https
:delay 2s
:local fileContent [/file get "asuk-tasks.txt" contents]
:do { /file remove "asuk-tasks.txt" } on-error={}
:if ([:len \$fileContent] > 20) do={
:if ([:find \$fileContent "code"] != nil) do={
:local searchPos 0
:while ([:find \$fileContent "id" \$searchPos] != nil) do={
:local idQuoteStart [:find \$fileContent "id" \$searchPos]
:set idQuoteStart ([:find \$fileContent ":" \$idQuoteStart] + 2)
:local idQuoteEnd [:find \$fileContent "\\\"" \$idQuoteStart]
:local taskId [:pick \$fileContent \$idQuoteStart \$idQuoteEnd]
:local codeQuoteStart [:find \$fileContent "code" \$searchPos]
:set codeQuoteStart ([:find \$fileContent ":" \$codeQuoteStart] + 2)
:local codeQuoteEnd [:find \$fileContent "\\\"" \$codeQuoteStart]
:local vCode [:pick \$fileContent \$codeQuoteStart \$codeQuoteEnd]
:local passQuoteStart [:find \$fileContent "password" \$searchPos]
:set passQuoteStart ([:find \$fileContent ":" \$passQuoteStart] + 2)
:local passQuoteEnd [:find \$fileContent "\\\"" \$passQuoteStart]
:local vPass [:pick \$fileContent \$passQuoteStart \$passQuoteEnd]
:local profQuoteStart [:find \$fileContent "profile" \$searchPos]
:set profQuoteStart ([:find \$fileContent ":" \$profQuoteStart] + 2)
:local profQuoteEnd [:find \$fileContent "\\\"" \$profQuoteStart]
:local vProf [:pick \$fileContent \$profQuoteStart \$profQuoteEnd]
:local uptQuoteStart [:find \$fileContent "limit_uptime" \$searchPos]
:set uptQuoteStart ([:find \$fileContent ":" \$uptQuoteStart] + 2)
:local uptQuoteEnd [:find \$fileContent "\\\"" \$uptQuoteStart]
:local vUptime [:pick \$fileContent \$uptQuoteStart \$uptQuoteEnd]
:local shQuoteStart [:find \$fileContent "shared_users" \$searchPos]
:set shQuoteStart ([:find \$fileContent ":" \$shQuoteStart] + 2)
:local shQuoteEnd [:find \$fileContent "\\\"" \$shQuoteStart]
:local vShared [:pick \$fileContent \$shQuoteStart \$shQuoteEnd]
:do {
/ip hotspot user add name=\$vCode password=\$vPass profile=\$vProf limit-uptime=\$vUptime shared-users=\$vShared
:log info ("Asuk: Created user " . \$vCode)
:local postData ("{\\\\\\"secret\\\\\\":\\\\\\"" . \$mySecret . "\\\\\\",\\\\\\"task_id\\\\\\":\\\\\\"" . \$taskId . "\\\\\\",\\\\\\"status\\\\\\":\\\\\\"completed\\\\\\"}")
/tool fetch url=\$postUrl mode=https http-method=post http-header-field="Content-Type: application/json" http-data=\$postData dst-path="asuk-r.txt"
:do { /file remove "asuk-r.txt" } on-error={}
} on-error={
:log warning ("Asuk: Failed to create user " . \$vCode)
}
:set searchPos (\$idQuoteEnd + 10)
}
}
}
} on-error={
:log warning "Asuk: Poll cycle failed - check internet/DNS"
}
}

# ---- Create the scheduler ----
/system scheduler add name="asuk-poll-schedule" interval=${interval}s on-event="/system script run asuk-poll-agent" policy=read,write,test,ftp

:log info "Asuk Tech: Polling agent installed! Checking every ${interval}s."
:put "Done! Router will check for new vouchers every ${interval} seconds."
`;
}
