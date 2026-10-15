import { test, expect } from '@grafana/plugin-e2e';

test('should render provisioned dashboard with wind direction trail panels without errors', async ({
  gotoDashboardPage,
  readProvisionedDashboard,
}) => {
  const dashboard = await readProvisionedDashboard({ fileName: 'dashboard.json' });
  const dashboardPage = await gotoDashboardPage(dashboard);
  await expect(dashboardPage).not.toHavePanelErrors();
});

test('should display compass SVG and current wind readout for panel with data', async ({
  gotoPanelEditPage,
  readProvisionedDashboard,
}) => {
  const dashboard = await readProvisionedDashboard({ fileName: 'dashboard.json' });
  const panelEditPage = await gotoPanelEditPage({ dashboard, id: '1' });
  await expect(panelEditPage.panel.locator.getByTestId('windtrail-compass')).toBeVisible();
  await expect(panelEditPage.panel.locator.getByTestId('windtrail-current')).toBeVisible();
});

test('should display "No Wind Data Available" when panel data is empty', async ({
  gotoPanelEditPage,
  readProvisionedDashboard,
}) => {
  const dashboard = await readProvisionedDashboard({ fileName: 'dashboard.json' });
  const panelEditPage = await gotoPanelEditPage({ dashboard, id: '5' });
  await expect(panelEditPage.panel.locator.getByTestId('windtrail-empty')).toBeVisible();
  await expect(panelEditPage.panel.locator).toContainText('No Wind Data Available');
});

