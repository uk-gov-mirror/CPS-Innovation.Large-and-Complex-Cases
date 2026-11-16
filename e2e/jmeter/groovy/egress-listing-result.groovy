// Sampler "08b LCC Egress files - wait until listed". Its elapsed time is
// file_id assigned -> file visible in the LCC Egress listing. A failure here is
// the smoke test's "GetEgressFiles returned no file results" symptom.
long start = vars.get('egressListingStart') as long
SampleResult.setStartTime(start)
long now = System.currentTimeMillis()
vars.put('egressListingMs', (now - start) as String)

def polls = vars.get('egressListingPolls')
def secs = (now - start) / 1000
if (vars.get('fileListed') == 'true') {
    SampleResult.setResponseMessage("Listed after ${secs}s (${polls} list calls)")
} else {
    def msg = "File not in LCC Egress listing after ${secs}s (${polls} list calls)"
    SampleResult.setSuccessful(false)
    SampleResult.setResponseCode('NOT_LISTED')
    SampleResult.setResponseMessage(msg)
    vars.put('failedStage', 'egress-listing')
    vars.put('failureMessage', msg)
}
