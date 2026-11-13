import { forwardRef } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, vi, expect, beforeEach } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ChooseFolderPage from "./ChooseFolderPage";
import { getNetAppFolders, initiateBatchCopy } from "../../../apis/gateway-api";
import { ApiError } from "../../../common/errors/ApiError";
import { MainStateContext } from "../../../providers/MainStateProvider";
import {
  initialState,
  type MainState,
  type ManageMaterialsSourceItem,
} from "../../../reducers/mainStateReducer";
import { type CaseMetaDataResponse } from "../../../schemas";

vi.mock("../../../apis/gateway-api", () => ({
  getNetAppFolders: vi.fn(),
  initiateBatchCopy: vi.fn(),
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

const rootPath = "Thunderstruck/";
const mockDispatch = vi.fn();

const caseMetaData: CaseMetaDataResponse = {
  caseId: 12,
  egressWorkspaceId: "egress_1",
  egressWorkspaceName: "Workspace",
  netappFolderPath: rootPath,
  operationName: "Thunderstruck",
  leadDefendantName: null,
  activeTransferId: null,
  urn: "45AA2098221",
  activeManageMaterialsOperations: [],
};

const CaseManagementLocation = () => {
  const location = useLocation();
  return (
    <div data-testid="case-management-page">
      {JSON.stringify(location.state)}
    </div>
  );
};

const renderPage = ({
  sourceItems = [{ path: `${rootPath}1. Case management/`, isFolder: true }],
  stateCaseId = "12",
}: {
  sourceItems?: ManageMaterialsSourceItem[];
  stateCaseId?: string;
} = {}) => {
  const state: MainState = {
    ...initialState,
    appData: {
      ...initialState.appData,
      manageMaterialsPage: {
        caseId: stateCaseId,
        folderPath: rootPath,
        sourceItems,
        pendingCopies: [],
      },
    },
    apiData: {
      ...initialState.apiData,
      caseMetaData,
    },
  };
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MainStateContext.Provider value={{ state, dispatch: mockDispatch }}>
        <MemoryRouter
          initialEntries={[
            "/case/12/case-management",
            "/case/12/case-management/manage-materials-choose-folder",
          ]}
          initialIndex={1}
        >
          <Routes>
            <Route
              path="/case/:caseId/case-management"
              element={<CaseManagementLocation />}
            />
            <Route
              path="/case/:caseId/case-management/manage-materials-choose-folder"
              element={<ChooseFolderPage />}
            />
          </Routes>
        </MemoryRouter>
      </MainStateContext.Provider>
    </QueryClientProvider>,
  );
};

const getFolderButton = (name: string) =>
  screen.getByRole("button", { name: name.toLowerCase() });

const copyButton = () => screen.getByTestId("transfer-action-button");

const expectReturnedToManageMaterials = async () => {
  expect(await screen.findByTestId("case-management-page")).toHaveTextContent(
    JSON.stringify({ activeTab: "manage-materials" }),
  );
};

describe("ChooseFolderPage", () => {
  beforeEach(() => {
    mockDispatch.mockReset();
    vi.mocked(initiateBatchCopy).mockReset();
    vi.mocked(getNetAppFolders).mockImplementation(async (path: string) => {
      if (path === rootPath)
        return {
          folderData: [
            { path: `${rootPath}1. Case management/` },
            { path: `${rootPath}2. Experts/` },
            { path: `${rootPath}3. Counsel/` },
          ],
          fileData: [],
        };
      return { folderData: [], fileData: [] };
    });
  });

  it("shows the heading, the number of items being copied and the folder tree", async () => {
    renderPage({
      sourceItems: [
        { path: `${rootPath}1. Case management/`, isFolder: true },
        { path: `${rootPath}statement.pdf`, isFolder: false },
      ],
    });

    expect(
      screen.getByRole("heading", { name: "Choose a folder" }),
    ).toBeInTheDocument();
    expect(screen.getByText("You are copying 2 items.")).toBeInTheDocument();
    expect(
      screen.getByText("Select the folder you want to copy them into."),
    ).toBeInTheDocument();
    expect(await screen.findByRole("tree")).toBeInTheDocument();
    expect(getFolderButton("Thunderstruck")).toBeInTheDocument();
    expect(getFolderButton("3. Counsel")).toBeInTheDocument();
    expect(screen.queryByText("Transfer Files")).not.toBeInTheDocument();
  });

  it("uses singular text when copying one item", async () => {
    renderPage();

    expect(screen.getByText("You are copying 1 item.")).toBeInTheDocument();
    expect(
      screen.getByText("Select the folder you want to copy it into."),
    ).toBeInTheDocument();
  });

  it("updates the copy button to show the selected destination", async () => {
    renderPage();
    await screen.findByRole("tree");

    expect(copyButton()).toHaveTextContent("Copy");
    expect(copyButton()).toBeDisabled();

    await userEvent.click(getFolderButton("3. Counsel"));

    expect(copyButton()).toHaveTextContent("Copy to 3. Counsel");
    expect(copyButton()).toBeEnabled();
  });

  it("disables the folders being copied", async () => {
    renderPage();
    await screen.findByRole("tree");

    expect(getFolderButton("1. Case management")).toBeDisabled();
    expect(getFolderButton("2. Experts")).toBeEnabled();
    expect(getFolderButton("3. Counsel")).toBeEnabled();
  });

  it("copies the selected items to the destination and returns to manage materials", async () => {
    vi.mocked(initiateBatchCopy).mockResolvedValue({
      id: "copy-1",
      status: "Initiated",
      createdAt: "2026-01-01T00:00:00Z",
    });
    renderPage({
      sourceItems: [
        { path: `${rootPath}1. Case management/`, isFolder: true },
        { path: `${rootPath}statement.pdf`, isFolder: false },
      ],
    });
    await screen.findByRole("tree");

    await userEvent.click(getFolderButton("3. Counsel"));
    await userEvent.click(copyButton());

    expect(initiateBatchCopy).toHaveBeenCalledWith({
      caseId: 12,
      destinationPrefix: `${rootPath}3. Counsel/`,
      operations: [
        { type: "Folder", sourcePath: `${rootPath}1. Case management/` },
        { type: "Material", sourcePath: `${rootPath}statement.pdf` },
      ],
    });
    await expectReturnedToManageMaterials();
    expect(mockDispatch).toHaveBeenCalledWith({
      type: "ADD_MANAGE_MATERIALS_PENDING_COPY",
      payload: {
        id: "copy-1",
        caseId: "12",
        destinationPath: `${rootPath}3. Counsel/`,
      },
    });
  });

  it("returns to manage materials without copying when Cancel is clicked", async () => {
    renderPage();
    await screen.findByRole("tree");

    await userEvent.click(getFolderButton("3. Counsel"));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await expectReturnedToManageMaterials();
    expect(initiateBatchCopy).not.toHaveBeenCalled();
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it("returns to manage materials without copying when Back is clicked", async () => {
    renderPage();
    await screen.findByRole("tree");

    await userEvent.click(screen.getByTestId("link-back-link"));

    await expectReturnedToManageMaterials();
    expect(initiateBatchCopy).not.toHaveBeenCalled();
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it("shows the conflict messages on a 409", async () => {
    vi.mocked(initiateBatchCopy).mockRejectedValue(
      new ApiError(
        "initiate batch copy failed",
        "/netapp/copy/batch",
        { status: 409, statusText: "Conflict" },
        { customMessage: "first problem\nsecond problem" },
      ),
    );
    renderPage();
    await screen.findByRole("tree");

    await userEvent.click(getFolderButton("3. Counsel"));
    await userEvent.click(copyButton());

    const errorSummary = await screen.findByTestId(
      "choose-folder-error-summary",
    );
    expect(within(errorSummary).getByText("first problem")).toBeInTheDocument();
    expect(
      within(errorSummary).getByText("second problem"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("case-management-page")).toBeNull();
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it("redirects to manage materials when there are no items to copy", async () => {
    renderPage({ sourceItems: [] });

    await expectReturnedToManageMaterials();
  });

  it("redirects to manage materials when the saved selection is for another case", async () => {
    renderPage({ stateCaseId: "99" });

    await expectReturnedToManageMaterials();
  });
});
