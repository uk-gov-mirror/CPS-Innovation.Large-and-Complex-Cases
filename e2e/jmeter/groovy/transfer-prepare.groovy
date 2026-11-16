// Build the validate/initiate bodies. Payload shapes mirror
// e2e/pw/move-soak/helpers/harness.ts (validateTransfer / startMove).
import groovy.json.JsonOutput

SampleResult.setIgnore()

def folder = vars.get('egressSourceFolder')
def name = vars.get('egressFileName')
def common = [
    caseId              : vars.get('caseId') as long,
    transferDirection   : 'EgressToNetApp',
    transferType        : vars.get('transferType'),
    destinationPath     : vars.get('netappFolderPath'),
    workspaceId         : vars.get('workspaceId'),
    sourceRootFolderPath: folder,
]

vars.put('validateBody', JsonOutput.toJson(common + [
    sourcePaths: [[fileId: vars.get('fileId'), path: folder + name, isFolder: false]],
]))
vars.put('initiateBody', JsonOutput.toJson(common + [
    sourcePaths: [[fileId: vars.get('fileId'), path: name, fullFilePath: folder + name]],
]))
