// "08c Record uploaded file" (upload mode). Saves this case's Egress file to
// preparedCsv so transfer-mode runs can transfer it without uploading again.
// The file keeps one line per upload; the last line for a case wins.
def file = new File(props.get('lcc.preparedFile'))
def entry = [caseId    : vars.get('caseId'), workspaceId: vars.get('workspaceId'), fileId: vars.get('fileId'),
             fileName  : vars.get('egressFileName'), fileSizeMb: vars.get('fileSizeMb'), runId: vars.get('runId')]

synchronized (props) {
    if (!file.exists()) {
        file.parentFile?.mkdirs()
        file.write('caseId,workspaceId,fileId,fileName,fileSizeMb,runId\n', 'UTF-8')
    }
    file.append(entry.values().join(',') + '\n', 'UTF-8')
    props.get('lcc.prepared').put(entry.caseId, entry)
}

SampleResult.setResponseMessage("Recorded ${entry.fileName} (${entry.fileSizeMb}MB) for case ${entry.caseId}" +
                                (vars.get('previousFileId') ? '; deleting the earlier upload' : ''))
SampleResult.setResponseData(file.absolutePath, 'UTF-8')
