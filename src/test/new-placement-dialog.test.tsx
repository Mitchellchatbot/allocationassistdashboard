/**
 * Putting one doctor forward to several hospitals in a single action.
 *
 * placement_attempts is keyed (doctor_id, hospital_name), so this is N rows,
 * not one row with a list — the dialog's job is to create them all and to
 * refuse the pairs that already exist.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NewPlacementDialog } from "@/components/reports/PlacementsCard";
import type { PlacementAttempt } from "@/hooks/use-placement-attempts";

const HOSPITALS = [
  { id: "h1", name: "SKMC",       city: "Abu Dhabi", country: "UAE" },
  { id: "h2", name: "Mediclinic", city: "Dubai",     country: "UAE" },
  { id: "h3", name: "SGH",        city: "Dubai",     country: "UAE" },
  { id: "h4", name: "HMG Riyadh", city: "Riyadh",    country: "Saudi Arabia" },
];

let created = 0;
const upsertMock = vi.fn().mockImplementation(async (input: { hospital_name: string }) => ({
  id: `new-${++created}`, hospital_name: input.hospital_name,
}));
const markMock = vi.fn().mockResolvedValue(undefined);

vi.mock("@/hooks/use-hospitals", () => ({ useHospitals: () => ({ data: HOSPITALS }) }));
vi.mock("@/hooks/use-zoho-data", () => ({
  useZohoData: () => ({
    data: {
      rawLeads: [{ id: "1", Full_Name: "Ali Khan", Specialty_New: "Cardiology", Email: "a@b.c" }],
      rawDoctorsOnBoard: [],
    },
  }),
}));
vi.mock("@/hooks/use-placement-attempts", async () => {
  const actual = await vi.importActual<typeof import("@/hooks/use-placement-attempts")>("@/hooks/use-placement-attempts");
  return {
    ...actual,
    useUpsertPlacementAttempt: () => ({ mutateAsync: upsertMock }),
    useMarkPlacementMilestone: () => ({ mutateAsync: markMock }),
    useDeletePlacementAttempt: () => ({ mutateAsync: vi.fn() }),
  };
});

const attempt = (over: Partial<PlacementAttempt>): PlacementAttempt => ({
  id: "x", doctor_id: "lead:1", doctor_name: "Ali Khan", doctor_specialty: null,
  hospital_id: null, hospital_name: "H", shortlisted_at: null, interviewed_at: null, offered_at: null,
  signed_at: null, start_date: null, joined_at: null, relocated_at: null, paid_at: null, notes: null,
  source: "manual", created_by: null, created_at: "", updated_at: "", ...over,
});

function renderDialog(existing: PlacementAttempt[] = [], onCreated = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <NewPlacementDialog
        open
        existingAttempts={existing}
        preselectDoctorId={null}
        onClose={() => {}}
        onCreated={onCreated}
      />
    </QueryClientProvider>,
  );
  return onCreated;
}

const pickDoctor = () => fireEvent.click(screen.getByText("Ali Khan"));

beforeEach(() => { upsertMock.mockClear(); markMock.mockClear(); created = 0; });

describe("NewPlacementDialog", () => {
  it("creates one attempt per hospital picked", async () => {
    const onCreated = renderDialog();
    pickDoctor();

    for (const name of ["SKMC", "Mediclinic", "SGH"]) {
      fireEvent.click(screen.getByLabelText(`Add ${name}`));
    }

    fireEvent.click(screen.getByRole("button", { name: /Start tracking/i }));
    await waitFor(() => expect(upsertMock).toHaveBeenCalledTimes(3));

    const calls = upsertMock.mock.calls.map(c => c[0]);
    expect(calls.map(c => c.hospital_name)).toEqual(["SKMC", "Mediclinic", "SGH"]);
    expect(new Set(calls.map(c => c.doctor_id))).toEqual(new Set(["lead:1"]));
    expect(calls.map(c => c.hospital_id)).toEqual(["h1", "h2", "h3"]);
    // Never on the upsert payload: the date has to go through the milestone
    // marker so the matching placement_events row lands too.
    expect(calls.every(c => c.shortlisted_at === undefined)).toBe(true);
    await waitFor(() => expect(markMock).toHaveBeenCalledTimes(3));
    expect(markMock.mock.calls.every(c => c[0].column === "shortlisted_at")).toBe(true);

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(["new-1", "new-2", "new-3"]));
  });

  it("will not re-add a hospital the doctor is already tracked at", async () => {
    renderDialog([attempt({ id: "a1", hospital_name: "SKMC" })]);
    pickDoctor();

    expect(screen.getByLabelText("Add SKMC")).toBeDisabled();
    expect(screen.getByLabelText("Add Mediclinic")).not.toBeDisabled();

    // Nothing picked yet, so there is nothing to create.
    expect(screen.getByRole("button", { name: /Start tracking/i })).toBeDisabled();

    fireEvent.click(screen.getByLabelText("Add Mediclinic"));
    fireEvent.click(screen.getByRole("button", { name: /Start tracking/i }));
    await waitFor(() => expect(upsertMock).toHaveBeenCalledTimes(1));
    expect(upsertMock.mock.calls[0][0].hospital_name).toBe("Mediclinic");
  });

  it("leaves the dates alone when the shortlist date is cleared", async () => {
    renderDialog();
    pickDoctor();
    fireEvent.change(screen.getByLabelText("Shortlisted on"), { target: { value: "" } });
    fireEvent.click(screen.getByLabelText("Add SKMC"));
    fireEvent.click(screen.getByRole("button", { name: /Start tracking/i }));

    await waitFor(() => expect(upsertMock).toHaveBeenCalledTimes(1));
    expect(markMock).not.toHaveBeenCalled();
  });
});
