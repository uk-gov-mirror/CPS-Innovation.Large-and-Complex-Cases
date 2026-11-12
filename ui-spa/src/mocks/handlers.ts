import { http, delay, HttpResponse } from "msw";
import {
  caseAreasDev,
  caseAreasPlaywright,
  casesSearchResultsDev,
  casesSearchResultsPlaywright,
  egressSearchResultsDev,
  egressSearchResultsPlaywright,
  getConnectNetAppFolderResultsDev,
  getConnectNetAppFolderResultsPlaywright,
  caseMetaDataDev,
  caseMetaDataPlaywright,
  getEgressFolderResultsDev,
  getEgressFolderResultsPlaywright,
  getNetAppFolderResultsDev,
  getNetAppFolderResultsPlaywright,
  egressToNetAppIndexingTransferDev,
  egressToNetAppIndexingTransferPlaywright,
  netAppToEgressIndexingTransferDev,
  netAppToEgressIndexingTransferPlaywright,
  egressToNetAppTransferStatusDev,
  egressToNetAppTransferStatusPlaywright,
  netAppToEgressTransferStatusDev,
  netAppToEgressTransferStatusPlaywright,
  // egressToNetAppIndexingErrorDev,
  activityLogDev,
  activityLogPlaywright,
  MANAGE_MATERIALS_COPY_ID_DEV,
  manageMaterialsActiveOperationsDev,
  getNetAppToNetAppCopyStatusDev,
  MANAGE_MATERIALS_COPY_ID_PLAYWRIGHT,
  manageMaterialsActiveOperationsPlaywright,
  netAppToNetAppCopyStatusPlaywright,
} from "./data";
import { IndexingFileTransferPayload } from "../schemas/requests/indexingFileTransferPayload";
import { InitiateFileTransferPayload } from "../schemas/requests/initiateFileTransferPayload";
import {
  type BatchOperationPayload,
  type ManageMaterialsActiveResponse,
} from "../schemas";
import {
  collectLockedPaths,
  isPathLocked,
} from "../common/utils/manageMaterialsLocks";

export const CASE_REGISTRATION_JOURNEY_URN = "11AA1234567";

export const MANAGE_MATERIALS_CONFLICT_MESSAGE =
  "A conflicting manage materials operation is already in progress for one or more of the specified paths.";

const DEV_COPY_IN_PROGRESS_POLLS = 3;

export const setupHandlers = (baseUrl: string, apiMockSource: string) => {
  const isDevMock = () => apiMockSource === "dev";
  const RESPONSE_DELAY = isDevMock() ? 10 : 0;

  // The dev mock keeps the user's copy active for a few status polls so the
  // locks and the success banner can be seen working together.
  let devCopy: {
    payload: BatchOperationPayload;
    statusPolls: number;
  } | null = null;

  const getActiveOperations = (): ManageMaterialsActiveResponse => {
    if (!isDevMock()) return manageMaterialsActiveOperationsPlaywright;
    if (!devCopy) return manageMaterialsActiveOperationsDev;
    return [
      ...manageMaterialsActiveOperationsDev,
      {
        id: MANAGE_MATERIALS_COPY_ID_DEV,
        operationType: "BatchCopy",
        sourcePaths: JSON.stringify(
          devCopy.payload.operations.map(({ sourcePath }) => sourcePath),
        ),
        destinationPaths: JSON.stringify([devCopy.payload.destinationPrefix]),
        userName: "dev_user@example.org",
        createdAt: new Date().toISOString(),
      },
    ];
  };

  return [
    http.get(`${baseUrl}/api/v1/areas`, async () => {
      const results = isDevMock() ? caseAreasDev : caseAreasPlaywright;
      await delay(RESPONSE_DELAY);
      return HttpResponse.json(results);
    }),

    http.get(`${baseUrl}/api/v1/case-search`, async (req) => {
      const url = new URL(req.request.url);
      const urn = url.searchParams.get("urn");

      const caseSearchResults = isDevMock()
        ? casesSearchResultsDev
        : casesSearchResultsPlaywright;
      await delay(RESPONSE_DELAY);
      // If there are multiple results for the case registration extended journey ui will throw error.
      // So on mock, always use  URN 11AA1234567 for case registration extended journey
      const caseRegistrationJourneyCaseDetail = [
        {
          operationName: "Thunderstruck1_pl",
          urn: CASE_REGISTRATION_JOURNEY_URN,
          caseId: 12,
          leadDefendantName: "abc1",
          egressWorkspaceId: null,
          netappFolderPath: null,
          registrationDate: "2000-01-02",
        },
      ];
      if (urn === CASE_REGISTRATION_JOURNEY_URN) {
        return HttpResponse.json(caseRegistrationJourneyCaseDetail);
      }
      return HttpResponse.json(caseSearchResults);
    }),

    http.get(`${baseUrl}/api/v1/egress/workspaces`, async () => {
      const egressSearchResults = isDevMock()
        ? egressSearchResultsDev
        : egressSearchResultsPlaywright;
      await delay(RESPONSE_DELAY);

      return HttpResponse.json(egressSearchResults);
    }),

    http.post(`${baseUrl}/api/v1/egress/workspaces`, async () => {
      return HttpResponse.json({});
    }),

    http.post(`${baseUrl}/api/v1/egress/connections`, async () => {
      return new HttpResponse(null, { status: 200 });
    }),

    http.get(`${baseUrl}/api/v1/netapp/folders`, async (req) => {
      const url = new URL(req.request.url);

      const path = url.searchParams.get("path");
      const operationName = url.searchParams.get("operation-name");
      const netAppRootFolderResults = isDevMock()
        ? getConnectNetAppFolderResultsDev(path as string, operationName)
        : getConnectNetAppFolderResultsPlaywright(path as string);
      await delay(500);

      return HttpResponse.json(netAppRootFolderResults);
    }),

    http.post(`${baseUrl}/api/v1/netapp/connections`, async () => {
      return HttpResponse.json({});
    }),

    http.get(`${baseUrl}/api/v1/cases/12`, async () => {
      const caseMetaDataResults = isDevMock()
        ? caseMetaDataDev
        : caseMetaDataPlaywright;
      await delay(100);

      return HttpResponse.json(caseMetaDataResults);
    }),

    http.get(
      `${baseUrl}/api/v1/egress/workspaces/egress_1/files`,
      async (req) => {
        const url = new URL(req.request.url);

        const folderId = url.searchParams.get("folder-id");
        const path = url.searchParams.get("path");
        const egressRootFolderResults = isDevMock()
          ? getEgressFolderResultsDev(folderId as string, path as string)
          : getEgressFolderResultsPlaywright(
              folderId as string,
              path as string,
            );
        await delay(500);
        return HttpResponse.json(egressRootFolderResults);
      },
    ),

    http.get(`${baseUrl}/api/v1/netapp/files`, async (req) => {
      const url = new URL(req.request.url);

      const path = url.searchParams.get("path");
      const netAppRootFolderResults = isDevMock()
        ? getNetAppFolderResultsDev(path as string)
        : getNetAppFolderResultsPlaywright(path as string);
      await delay(500);
      return HttpResponse.json(netAppRootFolderResults);
    }),

    http.post(`${baseUrl}/api/v1/filetransfer/files`, async ({ request }) => {
      const requestPayload =
        (await request.json()) as IndexingFileTransferPayload;
      let response = {};
      if (requestPayload.transferDirection === "EgressToNetApp") {
        response = isDevMock()
          ? egressToNetAppIndexingTransferDev
          : egressToNetAppIndexingTransferPlaywright;
      }
      if (requestPayload.transferDirection === "NetAppToEgress") {
        response = isDevMock()
          ? netAppToEgressIndexingTransferDev
          : netAppToEgressIndexingTransferPlaywright;
      }
      await delay(2500);
      return HttpResponse.json(response);
    }),

    http.post(
      `${baseUrl}/api/v1/filetransfer/initiate`,
      async ({ request }) => {
        const requestPayload =
          (await request.json()) as InitiateFileTransferPayload;
        let response = {};
        await delay(2000);
        response =
          requestPayload.transferDirection === "EgressToNetApp"
            ? { id: "transfer-id-egress-to-netapp" }
            : { id: "transfer-id-netapp-to-egress" };

        return HttpResponse.json(response);
      },
    ),
    http.get(
      `${baseUrl}/api/v1/filetransfer/transfer-id-egress-to-netapp/status`,
      async () => {
        const response = isDevMock()
          ? egressToNetAppTransferStatusDev
          : egressToNetAppTransferStatusPlaywright;

        await delay(500);
        return HttpResponse.json(response);
      },
    ),
    http.get(
      `${baseUrl}/api/v1/filetransfer/transfer-id-netapp-to-egress/status`,
      async () => {
        const response = isDevMock()
          ? netAppToEgressTransferStatusDev
          : netAppToEgressTransferStatusPlaywright;

        await delay(1500);
        return HttpResponse.json(response);
      },
    ),
    http.get(
      `${baseUrl}/api/v1/cases/:caseId/manage-materials/active`,
      async () => {
        await delay(RESPONSE_DELAY);
        return HttpResponse.json(getActiveOperations());
      },
    ),

    http.post(`${baseUrl}/api/v1/netapp/copy/batch`, async ({ request }) => {
      const payload = (await request.json()) as BatchOperationPayload;
      await delay(isDevMock() ? 1000 : 0);
      const lockedPaths = collectLockedPaths(getActiveOperations());
      const requestedPaths = [
        payload.destinationPrefix,
        ...payload.operations.map(({ sourcePath }) => sourcePath),
      ];
      if (requestedPaths.some((path) => isPathLocked(path, lockedPaths))) {
        return HttpResponse.json([MANAGE_MATERIALS_CONFLICT_MESSAGE], {
          status: 409,
        });
      }
      const id = isDevMock()
        ? MANAGE_MATERIALS_COPY_ID_DEV
        : MANAGE_MATERIALS_COPY_ID_PLAYWRIGHT;
      if (isDevMock()) devCopy = { payload, statusPolls: 0 };
      return HttpResponse.json(
        { id, status: "Initiated", createdAt: new Date().toISOString() },
        { status: 202 },
      );
    }),

    http.get(
      `${baseUrl}/api/v1/filetransfer/${MANAGE_MATERIALS_COPY_ID_DEV}/status`,
      async () => {
        await delay(1000);
        if (!devCopy) {
          return HttpResponse.json(
            getNetAppToNetAppCopyStatusDev("Completed", []),
          );
        }
        devCopy.statusPolls += 1;
        const sourcePaths = devCopy.payload.operations.map(
          ({ sourcePath }) => sourcePath,
        );
        if (devCopy.statusPolls <= DEV_COPY_IN_PROGRESS_POLLS) {
          return HttpResponse.json(
            getNetAppToNetAppCopyStatusDev("InProgress", sourcePaths),
          );
        }
        devCopy = null;
        return HttpResponse.json(
          getNetAppToNetAppCopyStatusDev("Completed", sourcePaths),
        );
      },
    ),

    http.get(
      `${baseUrl}/api/v1/filetransfer/${MANAGE_MATERIALS_COPY_ID_PLAYWRIGHT}/status`,
      async () => {
        await delay(RESPONSE_DELAY);
        return HttpResponse.json(netAppToNetAppCopyStatusPlaywright);
      },
    ),

    http.get(`${baseUrl}/api/v1/activity/logs`, async () => {
      const response = isDevMock() ? activityLogDev : activityLogPlaywright;

      await delay(1500);
      return HttpResponse.json(response);
    }),

    http.post(
      `${baseUrl}/api/v1/filetransfer/transfer-id-egress-to-netapp/clear`,
      async () => {
        return HttpResponse.json({});
      },
    ),
    http.post(
      `${baseUrl}/api/v1/filetransfer/transfer-id-netapp-to-egress/clear`,
      async () => {
        return HttpResponse.json({});
      },
    ),
    http.get(`${baseUrl}/api/v1/activity/*/logs/download`, async () => {
      const mockBlob = new Blob(["hello"], { type: "text/csv" });

      await delay(100);
      return new HttpResponse(mockBlob, {
        status: 200,
        headers: { "Content-Type": "text/csv" },
      });
    }),
    http.delete(`${baseUrl}/api/v1/netapp/connections`, async () => {
      await delay(1500);
      return new HttpResponse(null, { status: 200 });
    }),
    http.delete(`${baseUrl}/api/v1/egress/connections`, async () => {
      await delay(1500);
      return new HttpResponse(null, { status: 200 });
    }),
  ];
};

type caseSearchResult = {
  caseId: number;
  leadDefendantName: string;
  urn: string;
};
export type caseSearchResults = caseSearchResult[];
