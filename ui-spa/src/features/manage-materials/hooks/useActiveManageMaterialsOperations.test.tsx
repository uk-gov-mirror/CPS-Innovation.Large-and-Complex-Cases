import { renderHook, waitFor, act } from "@testing-library/react";
import { describe, it, vi, expect, beforeEach, afterEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  ACTIVE_OPERATIONS_POLL_INTERVAL_MS,
  useActiveManageMaterialsOperations,
} from "./useActiveManageMaterialsOperations";
import { getActiveManageMaterialsOperations } from "../../../apis/gateway-api";
import { type ManageMaterialsOperation } from "../../../schemas";

vi.mock("../../../apis/gateway-api", () => ({
  getActiveManageMaterialsOperations: vi.fn(),
}));

const operation: ManageMaterialsOperation = {
  id: "op-1",
  operationType: "BatchCopy",
  sourcePaths: JSON.stringify(["netapp/a/"]),
  destinationPaths: JSON.stringify(["netapp/b/"]),
  userName: "user",
  createdAt: "2026-01-01T00:00:00Z",
};

const renderActiveOperationsHook = (
  initialOperations: ManageMaterialsOperation[] | undefined,
  enabled = true,
) => {
  const queryClient = new QueryClient();
  return renderHook(
    () => useActiveManageMaterialsOperations("12", initialOperations, enabled),
    {
      wrapper: ({ children }) => (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      ),
    },
  );
};

describe("useActiveManageMaterialsOperations", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(getActiveManageMaterialsOperations).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses the initial operations straight away", () => {
    vi.mocked(getActiveManageMaterialsOperations).mockResolvedValue([
      operation,
    ]);
    const { result } = renderActiveOperationsHook([operation]);

    expect(result.current.activeOperations).toEqual([operation]);
  });

  it("refetches on mount so the active operations are current", async () => {
    vi.mocked(getActiveManageMaterialsOperations).mockResolvedValue([]);
    const { result } = renderActiveOperationsHook([operation]);

    await waitFor(() => expect(result.current.activeOperations).toEqual([]));
    expect(getActiveManageMaterialsOperations).toHaveBeenCalledWith("12");
  });

  it("polls while operations are active and stops once none are left", async () => {
    vi.mocked(getActiveManageMaterialsOperations)
      .mockResolvedValueOnce([operation])
      .mockResolvedValueOnce([operation])
      .mockResolvedValue([]);
    const { result } = renderActiveOperationsHook([]);

    await waitFor(() =>
      expect(result.current.activeOperations).toEqual([operation]),
    );
    expect(getActiveManageMaterialsOperations).toHaveBeenCalledTimes(1);

    await act(() =>
      vi.advanceTimersByTimeAsync(ACTIVE_OPERATIONS_POLL_INTERVAL_MS),
    );
    expect(getActiveManageMaterialsOperations).toHaveBeenCalledTimes(2);

    await act(() =>
      vi.advanceTimersByTimeAsync(ACTIVE_OPERATIONS_POLL_INTERVAL_MS),
    );
    await waitFor(() => expect(result.current.activeOperations).toEqual([]));
    expect(getActiveManageMaterialsOperations).toHaveBeenCalledTimes(3);

    await act(() =>
      vi.advanceTimersByTimeAsync(ACTIVE_OPERATIONS_POLL_INTERVAL_MS * 3),
    );
    expect(getActiveManageMaterialsOperations).toHaveBeenCalledTimes(3);
  });

  it("does not fetch when disabled", () => {
    const { result } = renderActiveOperationsHook([operation], false);

    expect(result.current.activeOperations).toEqual([operation]);
    expect(getActiveManageMaterialsOperations).not.toHaveBeenCalled();
  });
});
