// PostProcessor on "01c LCC case search" (the smoke test's SearchCase).
// /api/v1/case-search returns 400 "Search Parameters Invalid" for a bad query,
// and also 400 when the CMS session in Cms-Auth-Values is missing or stale.
// 500s come from DDEI/CMS. None of these stop the journey.
import groovy.json.JsonSlurper

vars.put('caseSearchCode', prev.responseCode)

if (prev.responseCode == '200') {
    def results = new JsonSlurper().parseText(prev.responseDataAsString ?: '[]')
    def found = (results instanceof List) && results.any { (it.caseId as String) == vars.get('caseId') }
    if (!found) {
        prev.setSuccessful(false)
        prev.setResponseMessage("Case ${vars.get('caseId')} not in search results for URN ${vars.get('caseUrn')}")
    }
} else {
    if (prev.responseCode == '401') {
        vars.put('aadTokenAt', '0')
    }
    // Force a fresh CMS session next time in case this one has gone stale.
    if (prev.responseCode == '400') {
        vars.put('cmsAuthAt', '0')
    }
    prev.setResponseMessage("${prev.responseMessage}: ${prev.responseDataAsString.take(150)}")
}
