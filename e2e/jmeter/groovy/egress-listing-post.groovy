// PostProcessor on "08a LCC Egress files - list poll" (the smoke test's
// GetEgressFiles). Egress can assign a file_id before the file shows in a
// folder listing, so this waits until the LCC API lists the uploaded file,
// which is what the UI needs before a user can select and transfer it.
// The folder is paged: a full page that doesn't contain the file moves on to
// the next page straight away. A wait only happens after a complete pass.
import groovy.json.JsonSlurper

vars.put('egressListingPolls', ((vars.get('egressListingPolls') as int) + 1) as String)
int take = vars.get('egressListingTake') as int

if (prev.responseCode == '200') {
    def items = new JsonSlurper().parseText(prev.responseDataAsString).data ?: []
    def listed = items.any { !it.isFolder && ((it.id as String) == vars.get('fileId') || it.name == vars.get('egressFileName')) }
    if (listed) {
        vars.put('fileListed', 'true')
        vars.put('pollListing', 'false')
        return
    }
    if (items.size() >= take) {
        vars.put('listSkip', ((vars.get('listSkip') as int) + take) as String)
        vars.put('listPause', 'false')
        return
    }
} else if (prev.responseCode == '401') {
    vars.put('aadTokenAt', '0')
}

vars.put('listSkip', '0')
vars.put('listPause', 'true')
long waited = System.currentTimeMillis() - (vars.get('egressListingStart') as long)
if (waited >= (vars.get('egressListingTimeoutSec') as long) * 1000L) {
    vars.put('pollListing', 'false')
}
