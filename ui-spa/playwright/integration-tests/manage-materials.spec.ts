import { expect, test } from "./utils/test";
import { Page } from "@playwright/test";
import { HttpResponse, http } from "msw";

test.describe("Manage materials", () => {
  const goToCaseManagement = async (page: Page, searchParam: string = "") => {
    await page.goto(`/case/12/case-management?${searchParam}`);
    await expect(page.locator("h1")).toHaveText(`Thunderstruck`);

    await expect(page.getByTestId("tab-active")).toHaveText(
      "Transfer materials",
    );
  };

  test("Should show the manage materials tab correctly", async ({ page }) => {
    await goToCaseManagement(page, "case-details=true");
    await page.getByTestId("tab-1").click();
    await expect(page.getByTestId("tab-active")).toHaveText("Manage materials");
    await expect(page.getByTestId("tab-2")).toHaveText("Activity log");
  });

  test("Should enable the actions on selection options only when materials are selected", async ({
    page,
  }) => {
    const selectionActions = [
      "Copy",
      "Move",
      "Rename selected items",
      "Delete",
    ];
    await goToCaseManagement(page, "case-details=true");
    await page.getByTestId("tab-1").click();
    await expect(page.getByTestId("materials-table")).toBeVisible();

    const actionsButton = page.getByRole("button", {
      name: "Actions on selection",
    });
    const actionsPanel = page.getByTestId("dropdown-panel");

    await actionsButton.click();
    for (const name of selectionActions) {
      await expect(actionsPanel.getByRole("button", { name })).toBeDisabled();
    }
    await actionsButton.click();

    await page.getByTestId("material-checkbox-file-1-0.pdf").check();
    await actionsButton.click();
    await expect(actionsPanel.getByRole("button")).toHaveText(selectionActions);
    for (const name of selectionActions) {
      await expect(actionsPanel.getByRole("button", { name })).toBeEnabled();
    }
  });

  const goToManageMaterials = async (page: Page) => {
    await goToCaseManagement(page, "case-details=true");
    await page.getByTestId("tab-1").click();
    await expect(page.getByTestId("materials-table")).toBeVisible();
  };

  const startCopy = async (page: Page, materialName: string) => {
    await page.getByTestId(`material-checkbox-${materialName}`).check();
    await page.getByRole("button", { name: "Actions on selection" }).click();
    await page
      .getByTestId("dropdown-panel")
      .getByRole("button", { name: "Copy" })
      .click();
    await expect(page).toHaveURL(
      "/case/12/case-management/manage-materials-choose-folder?case-details=true",
    );
    await expect(page.locator("h1")).toHaveText("Choose a folder");
    await expect(page.getByText("You are copying 1 item.")).toBeVisible();
    await expect(
      page.getByText("Select the folder you want to copy it into."),
    ).toBeVisible();
  };

  const expectBackOnManageMaterials = async (page: Page) => {
    await expect(page).toHaveURL("/case/12/case-management?case-details=true");
    await expect(page.getByTestId("tab-active")).toHaveText("Manage materials");
    await expect(page.getByTestId("materials-table")).toBeVisible();
  };

  test("Should copy a folder and show the success banner", async ({ page }) => {
    await goToManageMaterials(page);
    await startCopy(page, "folder-1-0");

    const actionButton = page.getByTestId("transfer-action-button");
    await expect(actionButton).toHaveText("Copy");
    await expect(actionButton).toBeDisabled();
    await page.getByRole("button", { name: "folder-1-1" }).click();
    await expect(actionButton).toHaveText("Copy to folder-1-1");
    await actionButton.click();

    await expectBackOnManageMaterials(page);
    const banner = page.getByTestId("copy-success-notification-banner");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("The materials have been copied");
    await expect(banner).toContainText("They are in:");
    await expect(
      page.getByTestId("copy-success-destination-folder"),
    ).toHaveText("folder-1-1");
    await banner.getByText("Show copied materials").click();
    await expect(banner.getByText("file-2-0.pdf")).toBeVisible();
    await expect(banner.getByText("file-2-1.pdf")).toBeVisible();

    await expect(
      page.getByTestId("material-checkbox-folder-1-0"),
    ).toBeEnabled();
    await expect(
      page.getByTestId("material-checkbox-folder-1-0"),
    ).not.toBeChecked();
  });

  test("Should return to manage materials without copying when Cancel is clicked", async ({
    page,
  }) => {
    await goToManageMaterials(page);
    await startCopy(page, "folder-1-0");
    await page.getByRole("button", { name: "folder-1-1" }).click();
    await page.getByRole("button", { name: "Cancel" }).click();

    await expectBackOnManageMaterials(page);
    await expect(
      page.getByTestId("copy-success-notification-banner"),
    ).not.toBeVisible();
  });

  test("Should return to manage materials without copying when Back is clicked", async ({
    page,
  }) => {
    await goToManageMaterials(page);
    await startCopy(page, "folder-1-0");
    await page.getByRole("link", { name: "Back" }).click();

    await expectBackOnManageMaterials(page);
    await expect(
      page.getByTestId("copy-success-notification-banner"),
    ).not.toBeVisible();
  });

  test("Should disable materials and destination folders locked by an in-progress copy", async ({
    page,
    worker,
  }) => {
    await worker.use(
      http.get(
        "https://mocked-out-api/api/v1/cases/:caseId/manage-materials/active",
        async () =>
          HttpResponse.json([
            {
              id: "00000000-0000-4000-8000-000000000030",
              operationType: "BatchCopy",
              sourcePaths: JSON.stringify(["netapp/folder-1-1/"]),
              destinationPaths: JSON.stringify([
                "netapp/folder-1-1/folder-2-0/",
              ]),
              userName: "another_user@example.org",
              createdAt: "2000-01-01T00:00:00Z",
            },
          ]),
      ),
    );
    await goToManageMaterials(page);

    await expect(
      page.getByTestId("materials-locked-notification-banner"),
    ).toContainText(
      "A copy is in progress for this case. 1 item in this folder is locked and cannot be selected.",
    );
    await expect(
      page.getByTestId("material-checkbox-folder-1-1"),
    ).toBeDisabled();

    await startCopy(page, "folder-1-0");
    await expect(
      page.getByTestId("choose-folder-locked-notification-banner"),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "folder-1-1" }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "folder-1-0" }),
    ).toBeDisabled();
    await expect(page.getByRole("button", { name: "netapp" })).toBeDisabled();
  });

  test("Should not show the manage materials tab if the feature is turned off", async ({
    page,
  }) => {
    await goToCaseManagement(page, "case-details=false");
    await expect(page.getByTestId("tab-1")).toHaveText("Activity log");
    await expect(page.getByTestId("tab-2")).not.toBeVisible();
  });
});
