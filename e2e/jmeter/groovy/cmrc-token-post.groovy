// PostProcessor on "01a CMRC token": DDEI's /authenticate expects a token for
// the CMRC API client, not the LCC one (same as e2e/pw/helpers/auth-api.ts getAuthTokens).
import groovy.json.JsonSlurper

if (prev.responseCode == '200') {
    vars.put('cmrcToken', new JsonSlurper().parseText(prev.responseDataAsString).access_token as String)
} else {
    log.error("${vars.get('threadLabel')}: CMRC token request failed (${prev.responseCode}): ${prev.responseDataAsString.take(300)}")
    vars.put('cmrcToken', '')
}
