import { act, renderHook } from "@testing-library/react";
import { describe, it, vi, expect, beforeEach } from "vitest";
import {
  type TrackedCopy,
  useTrackManageMaterialsCopy,
} from "./useTrackManageMaterialsCopy";
import { pollTransferStatus } from "../../../common/utils/pollTransferStatus";
import { type TransferStatusResponse } from "../../../schemas";

vi.mock("../../../common/utils/pollTransferStatus", () => ({
  pollTransferStatus: vi.fn(),
}));

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

const copy: TrackedCopy = { id: "op-1", destinationPath: "netapp/b/" };

describe("useTrackManageMaterialsCopy", () => {
  beforeEach(() => {
    vi.mocked(pollTransferStatus).mockReset();
  });

  const renderTrackingHook = (initialCopy: TrackedCopy | null = copy) => {
    const onCopyFinished = vi.fn();
    const hook = renderHook(
      ({ copy }) => useTrackManageMaterialsCopy({ copy, onCopyFinished }),
      { initialProps: { copy: initialCopy } },
    );
    return { ...hook, onCopyFinished };
  };

  it("does not poll when there is no copy", () => {
    renderTrackingHook(null);

    expect(pollTransferStatus).not.toHaveBeenCalled();
  });

  it("polls each copy only once", () => {
    const { rerender } = renderTrackingHook();

    rerender({ copy: { ...copy } });
    rerender({ copy: { id: "op-2", destinationPath: "netapp/c/" } });
    rerender({ copy: { ...copy } });

    expect(vi.mocked(pollTransferStatus).mock.calls.map(([id]) => id)).toEqual([
      "op-1",
      "op-2",
    ]);
  });

  it("reports the file counts while the copy is in progress", () => {
    let handleResponse: (response: TransferStatusResponse) => void = () => {};
    vi.mocked(pollTransferStatus).mockImplementation(
      async (_id, _shouldStop, onResponse) => {
        handleResponse = onResponse;
      },
    );
    const { result } = renderTrackingHook();
    expect(result.current.progress).toBeNull();

    act(() =>
      handleResponse(
        status({
          status: "InProgress",
          userName: "another.user@example.org",
          totalFiles: 10,
          processedFiles: 4,
        }),
      ),
    );

    expect(result.current.progress).toEqual({
      id: "op-1",
      userName: "another.user@example.org",
      totalFiles: 10,
      processedFiles: 4,
    });

    act(() => handleResponse(status({})));
    expect(result.current.progress).toBeNull();
  });

  it("reports the final result with the destination of the copy", () => {
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
    const { onCopyFinished } = renderTrackingHook();

    expect(onCopyFinished).toHaveBeenCalledTimes(1);
    expect(onCopyFinished).toHaveBeenCalledWith({
      id: "op-1",
      userName: "dev_user@example.org",
      status: "PartiallyCompleted",
      destinationPath: "netapp/b/",
      successfulItems: [{ path: "netapp/a/file.pdf" }],
      failedItems: [
        { sourcePath: "netapp/a/bad.pdf", errorCode: "GeneralError" },
      ],
    });
  });

  it("stops polling when unmounted", () => {
    const { unmount } = renderTrackingHook();
    const shouldStopPolling = vi.mocked(pollTransferStatus).mock.calls[0][1];

    expect(shouldStopPolling()).toBe(false);
    unmount();
    expect(shouldStopPolling()).toBe(true);
  });
});
