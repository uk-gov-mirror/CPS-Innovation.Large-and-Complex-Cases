import { type TransferStatusResponse } from "../../schemas";

export const MANAGE_MATERIALS_COPY_ID_DEV =
  "00000000-0000-4000-8000-000000000010";

export const getNetAppToNetAppCopyStatusDev = (
  status: TransferStatusResponse["status"],
  sourcePaths: string[],
  processedFiles: number = status === "Completed" ? sourcePaths.length : 0,
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
  processedFiles,
  successfulFiles: processedFiles,
  failedFiles: 0,
  successfulItems:
    status === "Completed"
      ? sourcePaths.map((sourcePath) => ({ sourcePath }))
      : [],
  destinationPath: "",
});
