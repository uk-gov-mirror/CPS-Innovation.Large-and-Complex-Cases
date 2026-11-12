import {
  type ManageMaterialsActiveResponse,
  type TransferStatusResponse,
} from "../../schemas";

export const MANAGE_MATERIALS_COPY_ID_PLAYWRIGHT =
  "00000000-0000-4000-8000-000000000020";

export const manageMaterialsActiveOperationsPlaywright: ManageMaterialsActiveResponse =
  [];

export const netAppToNetAppCopyStatusPlaywright: TransferStatusResponse = {
  id: MANAGE_MATERIALS_COPY_ID_PLAYWRIGHT,
  status: "Completed",
  transferType: "Copy",
  direction: "NetAppToNetApp",
  startedAt: "2026-01-01T09:00:00Z",
  completedAt: "2026-01-01T09:01:00Z",
  failedItems: [],
  userName: "dev_user@example.org",
  totalFiles: 2,
  processedFiles: 2,
  successfulFiles: 2,
  failedFiles: 0,
  successfulItems: [
    { sourcePath: "netapp/folder-1-0/file-2-0.pdf" },
    { sourcePath: "netapp/folder-1-0/file-2-1.pdf" },
  ],
  destinationPath: "",
};
