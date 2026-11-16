// PostProcessor on "01b CMS auth (DDEI)": the LCC API reads the CMS session
// from the Cms-Auth-Values cookie, holding the URI-encoded JSON that DDEI returns
// (encodeURIComponent(JSON.stringify(body)) in e2e/pw/helpers/auth-api.ts).
// A failure here is not fatal: case search then fails visibly, and the
// upload/transfer journey carries on, as it did in the smoke test.
import groovy.json.JsonOutput
import groovy.json.JsonSlurper

if (prev.responseCode == '200') {
    def json = JsonOutput.toJson(new JsonSlurper().parseText(prev.responseDataAsString))
    // URLEncoder is form encoding; undo the differences from encodeURIComponent.
    def encoded = URLEncoder.encode(json, 'UTF-8')
            .replace('+', '%20').replace('%21', '!').replace('%27', "'")
            .replace('%28', '(').replace('%29', ')').replace('%7E', '~')
    vars.put('cmsAuth', encoded)
    vars.put('cmsAuthAt', System.currentTimeMillis() as String)
} else {
    log.error("${vars.get('threadLabel')}: CMS auth via DDEI failed (${prev.responseCode}): ${prev.responseDataAsString.take(300)}")
    vars.put('cmsAuth', '')
}
