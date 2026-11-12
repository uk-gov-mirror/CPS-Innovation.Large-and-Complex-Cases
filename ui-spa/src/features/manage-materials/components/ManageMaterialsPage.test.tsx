import { forwardRef } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, vi, expect, beforeEach } from "vitest";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ErrorBoundary } from "react-error-boundary";
import ManageMaterialsPage from "./ManageMaterialsPage";
import {
  getActiveManageMaterialsOperations,
  getNetAppFolders,
} from "../../../apis/gateway-api";
import { ApiError } from "../../../common/errors/ApiError";
import { pollTransferStatus } from "../../../common/utils/pollTransferStatus";
import { MainStateContext } from "../../../providers/MainStateProvider";
import {
  initialState,
  type MainState,
  type ManageMaterialsPendingCopy,
} from "../../../reducers/mainStateReducer";
import {
  type ManageMaterialsOperation,
  type TransferStatusResponse,
} from "../../../schemas";

vi.mock("../../../apis/gateway-api", () => ({
  getNetAppFolders: vi.fn(),
  getActiveManageMaterialsOperations: vi.fn(),
}));

vi.mock("../../../common/utils/pollTransferStatus", () => ({
  pollTransferStatus: vi.fn(),
}));

vi.mock("../../../auth", () => ({
  useUserDetails: () => ({ username: "dev_user@example.org" }),
}));

// The govuk-frontend Button uses webpackPrefetch, which vitest cannot resolve.
vi.mock("../../../components/govuk", async () => {
  const actual = await vi.importActual("../../../components/govuk");
  const Button = forwardRef<
    HTMLButtonElement,
    React.ButtonHTMLAttributes<HTMLButtonElement>
  >((props, ref) => <button type="button" {...props} ref={ref} />);
  Button.displayName = "Button";
  return { ...actual, Button };
});

const mockNavigate = vi.fn();
vi.mock("react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router")>()),
  useNavigate: () => mockNavigate,
}));

const rootPath = "Thunderstruck/";
const mockDispatch = vi.fn();

type RenderOptions = {
  onError?: (error: unknown) => void;
  initialActiveOperations?: ManageMaterialsOperation[];
  pendingCopies?: ManageMaterialsPendingCopy[];
  folderPath?: string;
};

const renderPage = (options: RenderOptions | ((e: unknown) => void) = {}) => {
  const {
    onError,
    initialActiveOperations = [],
    pendingCopies = [],
    folderPath = "",
  } = typeof options === "function" ? { onError: options } : options;
  const state: MainState = {
    ...initialState,
    appData: {
      ...initialState.appData,
      manageMaterialsPage: {
        caseId: "12",
        folderPath,
        sourceItems: [],
        pendingCopies,
      },
    },
  };
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MainStateContext.Provider value={{ state, dispatch: mockDispatch }}>
        <MemoryRouter>
          <ErrorBoundary fallback={<></>} onError={onError}>
            <ManageMaterialsPage
              isTabActive={true}
              caseId="12"
              operationName="Thunderstruck"
              netAppPath={rootPath}
              initialActiveOperations={initialActiveOperations}
            />
          </ErrorBoundary>
        </MemoryRouter>
      </MainStateContext.Provider>
    </QueryClientProvider>,
  );
};

const activeOperation = (
  overrides: Partial<ManageMaterialsOperation> = {},
): ManageMaterialsOperation => ({
  id: "op-1",
  operationType: "BatchCopy",
  sourcePaths: JSON.stringify([`${rootPath}2. Experts/`]),
  destinationPaths: JSON.stringify([`${rootPath}9. Other/`]),
  userName: "another.user@example.org",
  createdAt: "2026-01-01T00:00:00Z",
  ...overrides,
});

const copyStatus = (
  overrides: Partial<TransferStatusResponse> = {},
): TransferStatusResponse => ({
  id: "copy-1",
  status: "Completed",
  transferType: "Copy",
  direction: "NetAppToNetApp",
  startedAt: null,
  completedAt: null,
  failedItems: [],
  userName: "dev_user@example.org",
  totalFiles: 2,
  processedFiles: 2,
  successfulFiles: 2,
  failedFiles: 0,
  successfulItems: [
    { sourcePath: `${rootPath}1. Case management/a.pdf` },
    { sourcePath: `${rootPath}1. Case management/b.pdf` },
  ],
  destinationPath: "",
  ...overrides,
});

const getCheckbox = (name: string) =>
  screen.getByRole("checkbox", { name }) as HTMLInputElement;

const getRowNames = () =>
  within(screen.getByTestId("materials-table"))
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getAllByRole("cell")[1].textContent);

const apiError = (status: number) =>
  new ApiError("failed", "/netapp/folders", { status, statusText: "" });

describe("ManageMaterialsPage", () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockDispatch.mockReset();
    vi.mocked(pollTransferStatus).mockReset();
    vi.mocked(getActiveManageMaterialsOperations).mockReset();
    vi.mocked(getActiveManageMaterialsOperations).mockResolvedValue([]);
    vi.mocked(getNetAppFolders).mockImplementation(async (path: string) => {
      if (path === rootPath)
        return {
          folderData: [
            { path: `${rootPath}1. Case management/` },
            { path: `${rootPath}2. Experts/` },
          ],
          fileData: [
            {
              path: `${rootPath}statement.pdf`,
              filesize: 1024,
              lastModified: "2024-08-22T00:00:00Z",
            },
          ],
        };
      return { folderData: [], fileData: [] };
    });
  });

  it("displays each material on its own row with a checkbox, folder icon and name", async () => {
    renderPage();

    expect(
      screen.getByRole("heading", {
        name: "Manage materials on the shared drive",
      }),
    ).toBeInTheDocument();

    const table = await screen.findByTestId("materials-table");
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(3);

    expect(within(rows[0]).getByRole("checkbox")).toBeInTheDocument();
    expect(within(rows[0]).getByTestId("folder-icon")).toBeInTheDocument();
    expect(within(rows[0]).getByText("1. Case management")).toBeInTheDocument();

    expect(within(rows[2]).getByRole("checkbox")).toBeInTheDocument();
    expect(within(rows[2]).queryByTestId("folder-icon")).toBeNull();
    expect(within(rows[2]).getByText("statement.pdf")).toBeInTheDocument();

    expect(
      screen.getByTestId("manage-materials-breadcrumbs"),
    ).toHaveTextContent("Shared Drive: Thunderstruck");
  });

  it("selects single and multiple items, and deselects without affecting the rest", async () => {
    renderPage();
    await screen.findByTestId("materials-table");

    await userEvent.click(getCheckbox("Select folder 1. Case management"));
    expect(getCheckbox("Select folder 1. Case management").checked).toBe(true);
    expect(getCheckbox("Select folder 2. Experts").checked).toBe(false);

    await userEvent.click(getCheckbox("Select file statement.pdf"));
    expect(getCheckbox("Select folder 1. Case management").checked).toBe(true);
    expect(getCheckbox("Select file statement.pdf").checked).toBe(true);

    await userEvent.click(getCheckbox("Select folder 1. Case management"));
    expect(getCheckbox("Select folder 1. Case management").checked).toBe(false);
    expect(getCheckbox("Select file statement.pdf").checked).toBe(true);
  });

  it("selects and deselects all visible items using the header checkbox", async () => {
    renderPage();
    await screen.findByTestId("materials-table");

    await userEvent.click(getCheckbox("Select all files and folders"));
    screen
      .getAllByRole("checkbox")
      .forEach((checkbox) =>
        expect((checkbox as HTMLInputElement).checked).toBe(true),
      );

    await userEvent.click(getCheckbox("Select folder 2. Experts"));
    expect(getCheckbox("Select all files and folders").checked).toBe(false);
    expect(getCheckbox("Select folder 1. Case management").checked).toBe(true);

    await userEvent.click(getCheckbox("Select folder 2. Experts"));
    expect(getCheckbox("Select all files and folders").checked).toBe(true);

    await userEvent.click(getCheckbox("Select all files and folders"));
    screen
      .getAllByRole("checkbox")
      .forEach((checkbox) =>
        expect((checkbox as HTMLInputElement).checked).toBe(false),
      );
  });

  describe("Actions on selection", () => {
    const selectionActions = [
      "Copy",
      "Move",
      "Rename selected items",
      "Delete",
    ];

    const openActionsMenu = async () => {
      await userEvent.click(
        screen.getByRole("button", { name: "Actions on selection" }),
      );
      return screen.getByTestId("dropdown-panel");
    };

    it("disables all options when no materials are selected", async () => {
      renderPage();
      await screen.findByTestId("materials-table");

      const panel = await openActionsMenu();
      selectionActions.forEach((name) =>
        expect(within(panel).getByRole("button", { name })).toBeDisabled(),
      );
    });

    it("displays all options enabled when one or more materials are selected", async () => {
      renderPage();
      await screen.findByTestId("materials-table");

      await userEvent.click(getCheckbox("Select file statement.pdf"));
      const panel = await openActionsMenu();

      const options = within(panel).getAllByRole("button");
      expect(options.map((option) => option.textContent)).toEqual(
        selectionActions,
      );
      options.forEach((option) => expect(option).toBeEnabled());
    });

    it("disables the options again when the selection is cleared", async () => {
      renderPage();
      await screen.findByTestId("materials-table");

      await userEvent.click(getCheckbox("Select all files and folders"));
      await userEvent.click(getCheckbox("Select all files and folders"));
      const panel = await openActionsMenu();

      selectionActions.forEach((name) =>
        expect(within(panel).getByRole("button", { name })).toBeDisabled(),
      );
    });
  });

  it("opens a folder and clears the selection", async () => {
    renderPage();
    await screen.findByTestId("materials-table");

    await userEvent.click(getCheckbox("Select file statement.pdf"));
    await userEvent.click(
      screen.getByRole("button", { name: "1. Case management" }),
    );

    expect(await screen.findByTestId("no-materials-text")).toBeInTheDocument();
    expect(getNetAppFolders).toHaveBeenCalledWith(
      `${rootPath}1. Case management/`,
    );
    expect(
      screen.getByTestId("manage-materials-breadcrumbs"),
    ).toHaveTextContent("1. Case management");

    await userEvent.click(
      screen.getByRole("button", { name: "Shared Drive: Thunderstruck" }),
    );
    expect(
      (await screen.findByRole("checkbox", {
        name: "Select file statement.pdf",
      })) as HTMLInputElement,
    ).not.toBeChecked();
  });

  it("sorts materials by name, toggling between ascending and descending", async () => {
    renderPage();
    await screen.findByTestId("materials-table");
    const sortButton = screen.getByRole("button", { name: /File or folder/ });

    await userEvent.click(sortButton);
    expect(getRowNames()).toEqual([
      "1. Case management",
      "2. Experts",
      "statement.pdf",
    ]);

    await userEvent.click(sortButton);
    expect(getRowNames()).toEqual([
      "statement.pdf",
      "2. Experts",
      "1. Case management",
    ]);

    await userEvent.click(sortButton);
    expect(getRowNames()).toEqual([
      "1. Case management",
      "2. Experts",
      "statement.pdf",
    ]);
  });

  it("redirects to the shared drive connection error page on a 404", async () => {
    vi.mocked(getNetAppFolders).mockRejectedValue(apiError(404));
    renderPage();

    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith(
        "/case/12/case-management/shared-drive-connection-error?operation-name=Thunderstruck",
        { state: { isRouteValid: true } },
      ),
    );
  });

  it("redirects to the shared drive connection error page on a 401", async () => {
    vi.mocked(getNetAppFolders).mockRejectedValue(apiError(401));
    renderPage();

    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith(
        "/case/12/case-management/connection-error?type=shareddrive",
        { state: { isRouteValid: true } },
      ),
    );
  });

  it("passes other API errors to the error boundary unchanged", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const error = apiError(500);
    vi.mocked(getNetAppFolders).mockRejectedValue(error);
    const onError = vi.fn();
    renderPage(onError);

    await waitFor(() => expect(onError).toHaveBeenCalled());
    expect(onError.mock.calls[0][0]).toBe(error);
    expect(mockNavigate).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("opens the folder saved in state when returning to the tab", async () => {
    renderPage({ folderPath: `${rootPath}1. Case management/` });

    expect(await screen.findByTestId("no-materials-text")).toBeInTheDocument();
    expect(getNetAppFolders).toHaveBeenCalledWith(
      `${rootPath}1. Case management/`,
    );
  });

  describe("Locked materials", () => {
    it("disables rows locked by an active operation and shows the locked banner", async () => {
      vi.mocked(getActiveManageMaterialsOperations).mockResolvedValue([
        activeOperation(),
      ]);
      renderPage({ initialActiveOperations: [activeOperation()] });
      await screen.findByTestId("materials-table");

      expect(getCheckbox("Select folder 2. Experts")).toBeDisabled();
      expect(getCheckbox("Select folder 1. Case management")).toBeEnabled();
      expect(getCheckbox("Select file statement.pdf")).toBeEnabled();
      expect(
        screen.getByTestId("materials-locked-notification-banner"),
      ).toHaveTextContent(
        "A copy is in progress for this case. 1 item in this folder is locked and cannot be selected.",
      );
    });

    it("only selects unlocked rows with select all", async () => {
      vi.mocked(getActiveManageMaterialsOperations).mockResolvedValue([
        activeOperation(),
      ]);
      renderPage({ initialActiveOperations: [activeOperation()] });
      await screen.findByTestId("materials-table");

      await userEvent.click(getCheckbox("Select all files and folders"));

      expect(getCheckbox("Select all files and folders").checked).toBe(true);
      expect(getCheckbox("Select folder 1. Case management").checked).toBe(
        true,
      );
      expect(getCheckbox("Select file statement.pdf").checked).toBe(true);
      expect(getCheckbox("Select folder 2. Experts").checked).toBe(false);
    });

    it("removes items from the selection when they become locked", async () => {
      let resolveActiveOperations: (
        ops: ManageMaterialsOperation[],
      ) => void = () => {};
      vi.mocked(getActiveManageMaterialsOperations).mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveActiveOperations = resolve;
          }),
      );
      renderPage();
      await screen.findByTestId("materials-table");

      await userEvent.click(getCheckbox("Select folder 2. Experts"));
      expect(getCheckbox("Select folder 2. Experts").checked).toBe(true);

      resolveActiveOperations([activeOperation()]);

      await waitFor(() =>
        expect(getCheckbox("Select folder 2. Experts")).toBeDisabled(),
      );
      expect(getCheckbox("Select folder 2. Experts").checked).toBe(false);
    });

    it("does not show the locked banner when there are no active operations", async () => {
      renderPage();
      await screen.findByTestId("materials-table");

      expect(
        screen.queryByTestId("materials-locked-notification-banner"),
      ).not.toBeInTheDocument();
    });
  });

  describe("Copy", () => {
    it("saves the selection and current folder, then opens the choose a folder page", async () => {
      renderPage();
      await screen.findByTestId("materials-table");

      await userEvent.click(getCheckbox("Select folder 1. Case management"));
      await userEvent.click(getCheckbox("Select file statement.pdf"));
      await userEvent.click(
        screen.getByRole("button", { name: "Actions on selection" }),
      );
      await userEvent.click(
        within(screen.getByTestId("dropdown-panel")).getByRole("button", {
          name: "Copy",
        }),
      );

      expect(mockDispatch).toHaveBeenCalledWith({
        type: "SET_MANAGE_MATERIALS_PAGE",
        payload: {
          caseId: "12",
          folderPath: rootPath,
          sourceItems: [
            { path: `${rootPath}1. Case management/`, isFolder: true },
            { path: `${rootPath}statement.pdf`, isFolder: false },
          ],
        },
      });
      expect(mockNavigate).toHaveBeenCalledWith(
        "/case/12/case-management/manage-materials-choose-folder",
      );
    });

    it("tracks a copy started in this session and shows the success banner when it completes", async () => {
      vi.mocked(pollTransferStatus).mockImplementation(
        async (_id, _shouldStop, handleResponse) => {
          handleResponse(copyStatus({ status: "InProgress" }));
          handleResponse(copyStatus());
        },
      );
      renderPage({
        pendingCopies: [
          {
            id: "copy-1",
            caseId: "12",
            destinationPath: `${rootPath}2. Experts/`,
          },
        ],
      });

      const banner = await screen.findByTestId(
        "copy-success-notification-banner",
      );
      expect(pollTransferStatus).toHaveBeenCalledTimes(1);
      expect(vi.mocked(pollTransferStatus).mock.calls[0][0]).toBe("copy-1");
      expect(banner).toHaveTextContent("The materials have been copied");
      expect(banner).toHaveTextContent("They are in: 2. Experts");
      expect(within(banner).getByText("Show copied materials")).toBeVisible();
      expect(within(banner).getByText("a.pdf")).toBeInTheDocument();
      expect(within(banner).getByText("b.pdf")).toBeInTheDocument();
      expect(mockDispatch).toHaveBeenCalledWith({
        type: "REMOVE_MANAGE_MATERIALS_PENDING_COPY",
        payload: { id: "copy-1" },
      });

      await userEvent.click(
        screen.getByTestId("copy-success-destination-folder"),
      );
      await waitFor(() =>
        expect(getNetAppFolders).toHaveBeenCalledWith(`${rootPath}2. Experts/`),
      );
    });

    it("keeps the table usable while a copy is in progress", async () => {
      vi.mocked(pollTransferStatus).mockImplementation(
        async (_id, _shouldStop, handleResponse) => {
          handleResponse(copyStatus({ status: "InProgress" }));
        },
      );
      renderPage({
        pendingCopies: [
          { id: "copy-1", caseId: "12", destinationPath: rootPath },
        ],
      });
      await screen.findByTestId("materials-table");

      await userEvent.click(getCheckbox("Select file statement.pdf"));
      expect(getCheckbox("Select file statement.pdf").checked).toBe(true);
      expect(
        screen.queryByTestId("copy-success-notification-banner"),
      ).not.toBeInTheDocument();
    });

    it("shows an error banner when a copy fails", async () => {
      vi.mocked(pollTransferStatus).mockImplementation(
        async (_id, _shouldStop, handleResponse) => {
          handleResponse(
            copyStatus({
              status: "PartiallyCompleted",
              successfulItems: [
                { sourcePath: `${rootPath}1. Case management/a.pdf` },
              ],
              failedItems: [
                {
                  sourcePath: `${rootPath}1. Case management/b.pdf`,
                  errorCode: "GeneralError",
                },
              ],
            }),
          );
        },
      );
      renderPage({
        pendingCopies: [
          { id: "copy-1", caseId: "12", destinationPath: rootPath },
        ],
      });

      const banner = await screen.findByTestId(
        "copy-error-notification-banner",
      );
      expect(banner).toHaveTextContent("Some materials could not be copied");
      expect(within(banner).getByText("Failed")).toBeInTheDocument();
      expect(
        screen.queryByTestId("copy-success-notification-banner"),
      ).not.toBeInTheDocument();
    });

    it("resumes tracking the current user's active copies but not other users' operations", async () => {
      const ownCopy = activeOperation({
        id: "own-copy",
        userName: "Dev_User@example.org",
      });
      const otherCopy = activeOperation({ id: "other-copy" });
      vi.mocked(getActiveManageMaterialsOperations).mockResolvedValue([
        ownCopy,
        otherCopy,
      ]);
      renderPage({ initialActiveOperations: [ownCopy, otherCopy] });
      await screen.findByTestId("materials-table");

      await waitFor(() => expect(pollTransferStatus).toHaveBeenCalled());
      expect(
        vi.mocked(pollTransferStatus).mock.calls.map(([id]) => id),
      ).toEqual(["own-copy"]);
    });
  });
});
