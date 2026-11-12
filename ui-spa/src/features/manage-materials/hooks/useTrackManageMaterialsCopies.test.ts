import { renderHook } from "@testing-library/react";
import { describe, it, vi, expect, beforeEach } from "vitest";
import { useTrackManageMaterialsCopies } from "./useTrackManageMaterialsCopies";
import { pollTransferStatus } from "../../../common/utils/pollTransferStatus";
import {
  type ManageMaterialsOperation,
  type TransferStatusResponse,
} from "../../../schemas";

vi.mock("../../../common/utils/pollTransferStatus", () => ({
  pollTransferStatus: vi.fn(),
}));

const operation = (
  overrides: Partial<ManageMaterialsOperation>,
): ManageMaterialsOperation => ({
  id: "op-1",
  operationType: "BatchCopy",
  sourcePaths: JSON.stringify(["netapp/a/"]),
  destinationPaths: JSON.stringify(["netapp/b/"]),
  userName: "dev_user@example.org",
  createdAt: "2026-01-01T00:00:00Z",
  ...overrides,
});

const status = (
  overrides: Partial<TransferStatusResponse>,
): TransferStatusResponse => ({
  id: "op-1",
  status: "Completed",
  transferType: "Copy",
  direction: "NetAppToNetApp",
  startedAt: null,
  completedAt: null,
  failedItems: [],
  userName: "dev_user@example.org",
  totalFiles: 1,
  processedFiles: 1,
  successfulFiles: 1,
  failedFiles: 0,
  successfulItems: [{ sourcePath: "netapp/a/file.pdf" }],
  destinationPath: "",
  ...overrides,
});

describe("useTrackManageMaterialsCopies", () => {
  beforeEach(() => {
    vi.mocked(pollTransferStatus).mockReset();
  });

  const renderTrackingHook = (
    props: Partial<Parameters<typeof useTrackManageMaterialsCopies>[0]> = {},
  ) => {
    const onCopyFinished = vi.fn();
    const initialProps = {
      activeOperations: [],
      pendingCopies: [],
      username: "dev_user@example.org",
      enabled: true,
      onCopyFinished,
      ...props,
    };
    const hook = renderHook(
      (hookProps) => useTrackManageMaterialsCopies(hookProps),
      {
        initialProps,
      },
    );
    return {
      ...hook,
      onCopyFinished: initialProps.onCopyFinished,
      initialProps,
    };
  };

  it("only tracks the current user's BatchCopy operations", () => {
    renderTrackingHook({
      activeOperations: [
        operation({ id: "own-copy" }),
        operation({ id: "other-user", userName: "someone.else@example.org" }),
        operation({ id: "own-move", operationType: "BatchMove" }),
      ],
    });

    expect(vi.mocked(pollTransferStatus).mock.calls.map(([id]) => id)).toEqual([
      "own-copy",
    ]);
  });

  it("tracks pending copies and each copy only once", () => {
    const pendingCopies = [{ id: "op-1", destinationPath: "netapp/b/" }];
    const { rerender, initialProps } = renderTrackingHook({
      pendingCopies,
      activeOperations: [operation({ id: "op-1" })],
    });

    rerender({
      ...initialProps,
      activeOperations: [operation({ id: "op-1" }), operation({ id: "op-2" })],
    });

    expect(vi.mocked(pollTransferStatus).mock.calls.map(([id]) => id)).toEqual([
      "op-1",
      "op-2",
    ]);
  });

  it("does not track anything when disabled", () => {
    renderTrackingHook({
      enabled: false,
      activeOperations: [operation({})],
    });

    expect(pollTransferStatus).not.toHaveBeenCalled();
  });

  it("reports the final result with the destination from the operation", () => {
    vi.mocked(pollTransferStatus).mockImplementation(
      async (_id, _shouldStop, handleResponse) => {
        handleResponse(status({ status: "InProgress" }));
        handleResponse(
          status({
            status: "PartiallyCompleted",
            failedItems: [
              { sourcePath: "netapp/a/bad.pdf", errorCode: "GeneralError" },
            ],
          }),
        );
      },
    );
    const { onCopyFinished } = renderTrackingHook({
      activeOperations: [operation({})],
    });

    expect(onCopyFinished).toHaveBeenCalledTimes(1);
    expect(onCopyFinished).toHaveBeenCalledWith({
      id: "op-1",
      status: "PartiallyCompleted",
      destinationPath: "netapp/b/",
      successfulItems: [{ path: "netapp/a/file.pdf" }],
      failedItems: [
        { sourcePath: "netapp/a/bad.pdf", errorCode: "GeneralError" },
      ],
    });
  });

  it("stops polling when unmounted", () => {
    const { unmount } = renderTrackingHook({
      activeOperations: [operation({})],
    });
    const shouldStopPolling = vi.mocked(pollTransferStatus).mock.calls[0][1];

    expect(shouldStopPolling()).toBe(false);
    unmount();
    expect(shouldStopPolling()).toBe(true);
  });
});
