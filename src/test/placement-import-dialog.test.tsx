/**
 * The import preview has to stop, not guess, whenever the sheet alone can't
 * say which hospital or which doctor a row belongs to.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PlacementImportDialog } from "@/components/processing/PlacementImportDialog";
import type { PlacementAttempt } from "@/hooks/use-placement-attempts";

const aliases = [
  { alias: "NMC-AUH", alias_key: "nmcauh", hospital_name: "NMC Abu Dhabi", hospital_id: null },
  { alias: "SKMC", alias_key: "skmc", hospital_name: "SKMC", hospital_id: null },
];

const applyMock = vi.fn().mockResolvedValue({ batch: "b1", inserted: 1, updated: 0, unchanged: 0 });
const addAliasMock = vi.fn().mockResolvedValue(undefined);

vi.mock("@/hooks/use-hospital-aliases", () => ({
  useHospitalAliases: () => ({ data: aliases }),
  useAddHospitalAlias: () => ({ mutateAsync: addAliasMock }),
}));
vi.mock("@/hooks/use-zoho-data", () => ({ useZohoData: () => ({ data: { rawLeads: [], rawDoctorsOnBoard: [] } }) }));
vi.mock("@/hooks/use-placement-attempts", async () => {
  const actual = await vi.importActual<typeof import("@/hooks/use-placement-attempts")>("@/hooks/use-placement-attempts");
  return {
    ...actual,
    useApplyPlacementImport: () => ({ mutateAsync: applyMock }),
    useUndoPlacementImport: () => ({ mutateAsync: vi.fn(), isPending: false }),
  };
});

const HEADER = "6/8/2026,Hospital,Doctors / candidates,Specialty,Shortlisted,Interview,offered,Signed,Start job Date,Joined,";

/** Pick a sheet, the way the file input delivers one. jsdom's File has no
 *  text(), which readTabularFile calls, so the test supplies it. */
const dropFile = async (csv: string) => {
  const input = screen.getByLabelText(/Pick .csv or .xlsx files/i) as HTMLInputElement;
  const file = Object.assign(new File([csv], "June.csv", { type: "text/csv" }), { text: async () => csv });
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  fireEvent.change(input);
  await screen.findByText(/June\.csv/);
};

const renderDialog = (existing: PlacementAttempt[] = []) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <PlacementImportDialog open existing={existing} onClose={() => {}} />
    </QueryClientProvider>,
  );
};

beforeEach(() => { applyMock.mockClear(); addAliasMock.mockClear(); });

describe("PlacementImportDialog", () => {
  it("will not import while a hospital spelling is unmapped, and remembers the answer", async () => {
    renderDialog();
    await dropFile([HEADER, `1,NMC-Qusais,Ali Khan,Cardiology,6/8/2026,,,,,,`].join("\n"));

    expect(await screen.findByText(/1 hospital spelling nobody has mapped/i)).toBeInTheDocument();
    const importButton = screen.getByRole("button", { name: /^Import/ });
    expect(importButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/Which hospital is "NMC-Qusais"\?/i), { target: { value: "NMC Abu Dhabi" } });
    await waitFor(() => expect(importButton).toBeEnabled());

    fireEvent.click(importButton);
    await waitFor(() => expect(applyMock).toHaveBeenCalled());
    expect(addAliasMock).toHaveBeenCalledWith(expect.objectContaining({ alias: "NMC-Qusais", hospital_name: "NMC Abu Dhabi" }));
    expect(applyMock.mock.calls[0][0].plan.inserts[0].hospital_name).toBe("NMC Abu Dhabi");
  });

  it("leaves out a join date marked HOLD unless it is ticked", async () => {
    renderDialog();
    await dropFile([HEADER, `4,SKMC,Sachin Bansod,ENT,,,,,,6/15/2026,HOLD ,HOLD `].join("\n"));

    const hold = await screen.findByText(/1 join date marked HOLD/i);
    const box = within(hold.parentElement!.parentElement!).getByRole("checkbox");
    expect(box).not.toBeChecked();

    fireEvent.click(screen.getByRole("button", { name: /^Import/ }));
    await waitFor(() => expect(applyMock).toHaveBeenCalled());
    expect(applyMock.mock.calls[0][0].plan.inserts[0].joined_at).toBeNull();
  });

  it("shows what the month's totals become", async () => {
    renderDialog();
    await dropFile([HEADER, `1,SKMC,Ali Khan,Cardiology,6/8/2026,,,,,,`, `2,SKMC,Sara Ali,ENT,6/8/2026,,,,,,`].join("\n"));

    const totals = (await screen.findByText(/What the dashboard will show/i)).parentElement!;
    expect(within(totals).getByText("2026-06")).toBeInTheDocument();
    expect(within(totals).getByText("2")).toBeInTheDocument();   // 0 → 2 shortlisted
  });
});
