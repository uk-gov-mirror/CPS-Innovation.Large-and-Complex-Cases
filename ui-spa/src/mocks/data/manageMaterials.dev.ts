import {
  type ManageMaterialsActiveResponse,
  type TransferStatusResponse,
} from "../../schemas";

export const MANAGE_MATERIALS_COPY_ID_DEV =
  "00000000-0000-4000-8000-000000000010";

// Another user's copy from folder-1-1 into folder-1-1/folder-2-0, so those
// rows render locked on the Manage materials tab.
export const manageMaterialsActiveOperationsDev: ManageMaterialsActiveResponse =
  [
    {
      id: "00000000-0000-4000-8000-000000000011",
      operationType: "BatchCopy",
      sourcePaths: JSON.stringify(["netapp/folder-1-1/"]),
      destinationPaths: JSON.stringify(["netapp/folder-1-1/folder-2-0/"]),
      userName: "another.user@example.org",
      createdAt: "2026-01-01T09:00:00Z",
    },
  ];

export const getNetAppToNetAppCopyStatusDev = (
  status: TransferStatusResponse["status"],
  sourcePaths: string[],
): TransferStatusResponse => ({
  id: MANAGE_MATERIALS_COPY_ID_DEV,
  status,
  transferType: "Copy",
  direction: "NetAppToNetApp",
  startedAt: "2026-01-01T09:00:00Z",
  completedAt: status === "Completed" ? "2026-01-01T09:01:00Z" : null,
  failedItems: [],
  userName: "dev_user@example.org",
  totalFiles: sourcePaths.length,
  processedFiles: status === "Completed" ? sourcePaths.length : 0,
  successfulFiles: status === "Completed" ? sourcePaths.length : 0,
  failedFiles: 0,
  successfulItems:
    status === "Completed"
      ? sourcePaths.map((sourcePath) => ({ sourcePath }))
      : [],
  destinationPath: "",
});
