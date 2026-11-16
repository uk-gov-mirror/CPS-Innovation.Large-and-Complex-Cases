// Sampler "08 Egress processing - wait for file_id". Its elapsed time is the
// Egress processing delay (upload complete -> file_id assigned). It fails on timeout.
long start = vars.get('egressWaitStart') as long
long now = System.currentTimeMillis()
SampleResult.setStartTime(start)
vars.put('egressProcessingMs', (now - start) as String)

def polls = vars.get('egressPolls')
if (vars.get('fileId')) {
    SampleResult.setResponseMessage("file_id after ${(now - start) / 1000}s (${polls} polls)")
    if (vars.get('waitForEgressListing') == 'true') {
        vars.put('egressListingStart', now as String)
        vars.put('pollListing', 'true')
    }
} else {
    def msg = "Egress processing timeout: no file_id after ${(now - start) / 1000}s (${polls} polls)"
    SampleResult.setSuccessful(false)
    SampleResult.setResponseCode('TIMEOUT')
    SampleResult.setResponseMessage(msg)
    vars.put('failedStage', 'egress-processing')
    vars.put('failureMessage', msg)
}
