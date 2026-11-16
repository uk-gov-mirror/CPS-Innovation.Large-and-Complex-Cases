// PostProcessor on "11 LCC transfer - status poll". A 404 straight after
// initiate means the orchestration entity isn't visible yet; that is a normal
// poll, not an error.
//
// Failed items with errorCode "Transient" while the transfer is still
// InProgress are the orchestrator's transient-retry pass at work
// (TransferState.RemoveTransientFailures re-queues them), not a final failure.
// They are counted so a polling timeout can be told apart from a stuck transfer.
import groovy.json.JsonOutput
import groovy.json.JsonSlurper

int polls = (vars.get('transferPolls') as int) + 1
vars.put('transferPolls', polls as String)

if (prev.responseCode == '200') {
    def s = new JsonSlurper().parseText(prev.responseDataAsString)
    def failed = s.failedItems ?: []
    def codes = failed.collect { it.errorCode as String }.findAll()

    if (polls == 1) {
        vars.put('firstPollStatus', s.status as String)
    }
    if ('Transient' in codes) {
        vars.put('transientPolls', ((vars.get('transientPolls') as int) + 1) as String)
    }
    def seen = ((vars.get('failedErrorCodes') ?: '').tokenize(';') + codes).unique().sort()
    vars.put('failedErrorCodes', seen.join(';'))

    vars.put('transferStatus', s.status as String)
    vars.put('transferSummary', JsonOutput.toJson([
        status         : s.status,
        totalFiles     : s.totalFiles,
        processedFiles : s.processedFiles,
        successfulFiles: s.successfulFiles,
        failedFiles    : s.failedFiles,
        errorMessage   : s.errorMessage,
        failedItems    : failed.collect { [sourcePath: it.sourcePath, errorCode: it.errorCode] },
    ]))
    prev.setResponseMessage("${s.status} ${s.processedFiles ?: 0}/${s.totalFiles ?: '?'}" +
                            (codes ? " failed: ${codes.join(',')}" : ''))
    if (s.status in ['Completed', 'PartiallyCompleted', 'Failed']) {
        vars.put('pollTransfer', 'false')
        return
    }
} else if (prev.responseCode == '404') {
    if (polls == 1) {
        vars.put('firstPollStatus', 'NotFound')
    }
    prev.setSuccessful(true)
    prev.setResponseMessage('Not visible yet (404)')
} else {
    if (polls == 1) {
        vars.put('firstPollStatus', "HTTP ${prev.responseCode}")
    }
    if (prev.responseCode == '401') {
        vars.put('aadTokenAt', '0')
    }
}

int maxPolls = vars.get('transferMaxPolls') as int
long waited = System.currentTimeMillis() - (vars.get('transferStart') as long)
if ((maxPolls > 0 && polls >= maxPolls) || waited > (vars.get('transferTimeoutMin') as long) * 60_000L) {
    vars.put('pollTransfer', 'false')
}
