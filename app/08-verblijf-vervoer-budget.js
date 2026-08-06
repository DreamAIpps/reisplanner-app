// ---------- Accommodation tab ----------
function AccommodationTab({ trip, accommodations, onRefresh, readOnly, currentUserId }) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [importing, setImporting] = useState(false);
  const [journal, setJournal] = useState([]);
  const [tripPhotos, setTripPhotos] = useState([]);

  const loadJournal = useCallback(async () => {
    try { setJournal(asList((await api.getJournal(trip.id)).entries)); } catch {}
  }, [trip.id]);
  useEffect(() => { loadJournal(); }, [loadJournal]);

  const loadPhotos = useCallback(async () => {
    try { setTripPhotos(await api.getPhotos(trip.id)); } catch {}
  }, [trip.id]);
  useEffect(() => { loadPhotos(); }, [loadPhotos]);

  async function handleDelete(a) {
    await api.deleteAccommodation(a.id);
    onRefresh();
    toonMelding(`"${a.name}" verwijderd`, {
      label: "Ongedaan maken",
      run: async () => {
        await api.addAccommodation(trip.id, {
          name: a.name, check_in: a.check_in, check_out: a.check_out, address: a.address,
          booking_ref: a.booking_ref, cost: a.cost, notes: a.notes, is_private: a.is_private,
        });
        onRefresh();
      },
    });
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-display text-[21px] text-gray-800">Accommodaties</h3>
        {!readOnly && <Button onClick={() => setShowForm(true)} variant="secondary">+ Verblijf toevoegen</Button>}
      </div>

      {accommodations.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <Icon name="bed" size={34} strokeWidth={1.2} className="mx-auto mb-3 text-gray-300" />
          <div>Nog geen verblijven toegevoegd</div>
        </div>
      ) : (
        <div className="space-y-3">
          {accommodations.map((acc) => {
            const nights = (acc.check_in && acc.check_out)
              ? Math.round((new Date(acc.check_out) - new Date(acc.check_in)) / 86400000)
              : null;
            const perNight = nights > 0 && acc.cost ? Number(acc.cost) / nights : null;
            return (
            <div key={acc.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 group">
              <div className="flex gap-4 items-start">
                <Icon name="bed" size={20} className="text-gray-400 mt-0.5" />
                <div className="flex-1">
                  <div className="font-semibold text-gray-800">{acc.name}</div>
                  {acc.address && <div className="text-sm text-gray-500 flex items-center gap-1"><Icon name="pin" size={13} />{acc.address}</div>}
                  <div className="flex gap-4 mt-1 text-sm text-gray-500 flex-wrap">
                    {acc.check_in && <span>Check-in: {fmt(acc.check_in)}</span>}
                    {acc.check_out && <span>Check-out: {fmt(acc.check_out)}</span>}
                    {acc.booking_ref && <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">#{acc.booking_ref}</span>}
                  </div>
                  {acc.cost && (
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="font-medium text-sm" style={{ color: PALETTE.coralDeep }}>{fmtMoney(acc.cost, trip.currency)}</span>
                      {perNight && nights && (
                        <span className="text-xs text-gray-400">· {nights} {nights === 1 ? "nacht" : "nachten"} · <span className="text-gray-500 font-medium">{fmtMoney(perNight, trip.currency)}/nacht</span></span>
                      )}
                    </div>
                  )}
                  {acc.notes && <div className="text-sm text-gray-500 mt-1">{acc.notes}</div>}
                </div>
                <div className={readOnly ? "flex gap-1" : "opacity-0 group-hover:opacity-100 flex gap-1"}>
                  <button onClick={() => setEditing(acc)} className="text-gray-400 hover:text-sky-600"><Icon name={readOnly ? "eye" : "pen"} size={16} /></button>
                  {!readOnly && <button onClick={() => handleDelete(acc)} className="text-gray-400 hover:text-red-500" aria-label="Verwijderen"><Icon name="trash" size={16} /></button>}
                </div>
              </div>
            </div>
            );
          })}
        </div>
      )}

      {showForm && <AccommodationForm tripId={trip.id} onSaved={() => { setShowForm(false); onRefresh(); }} onClose={() => setShowForm(false)} onImport={() => { setShowForm(false); setImporting(true); }} />}
      {editing && (
        <AccommodationForm tripId={trip.id} initial={editing}
          journalEntries={journal.filter((e) => e.accommodation_id === editing.id)} onJournalChange={loadJournal} currentUserId={currentUserId}
          photos={tripPhotos} onPhotosChange={loadPhotos} readOnly={readOnly} showPhotos
          onSaved={() => { setEditing(null); onRefresh(); }} onClose={() => setEditing(null)} />
      )}
      {importing && <ImportModal tripId={trip.id} onImported={() => { setImporting(false); onRefresh(); }} onClose={() => setImporting(false)} />}
    </div>
  );
}

// ---------- Transport tab ----------
const TRANSPORT_ICONS = { Vliegtuig: "plane", Trein: "train", Bus: "bus", Huurauto: "car", Taxi: "car", Boot: "boat", Anders: "route" };
function transportIcon(type) { return TRANSPORT_ICONS[type] || "route"; }

function TransportTab({ trip, transports, onRefresh, readOnly, currentUserId }) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [importing, setImporting] = useState(false);
  const [journal, setJournal] = useState([]);
  const [tripPhotos, setTripPhotos] = useState([]);

  const loadJournal = useCallback(async () => {
    try { setJournal(asList((await api.getJournal(trip.id)).entries)); } catch {}
  }, [trip.id]);
  useEffect(() => { loadJournal(); }, [loadJournal]);

  const loadPhotos = useCallback(async () => {
    try { setTripPhotos(await api.getPhotos(trip.id)); } catch {}
  }, [trip.id]);
  useEffect(() => { loadPhotos(); }, [loadPhotos]);

  async function handleDelete(t) {
    await api.deleteTransport(t.id);
    onRefresh();
    toonMelding(`${t.from_location || "Vervoer"} → ${t.to_location || ""} verwijderd`.trim(), {
      label: "Ongedaan maken",
      run: async () => {
        await api.addTransport(trip.id, {
          type: t.type, from_location: t.from_location, to_location: t.to_location,
          departure_time: t.departure_time, arrival_time: t.arrival_time, booking_ref: t.booking_ref,
          cost: t.cost, notes: t.notes, baggage_allowance: t.baggage_allowance, is_private: t.is_private,
        });
        onRefresh();
      },
    });
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-display text-[21px] text-gray-800">Vervoer</h3>
        {!readOnly && <Button onClick={() => setShowForm(true)} variant="secondary">+ Vervoer toevoegen</Button>}
      </div>

      {transports.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <Icon name="plane" size={34} strokeWidth={1.2} className="mx-auto mb-3 text-gray-300" />
          <div>Nog geen vervoer toegevoegd</div>
        </div>
      ) : (
        <div className="space-y-3">
          {transports.map((t) => (
            <div key={t.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 group">
              <div className="flex items-start gap-3">
                <Icon name={transportIcon(t.type)} size={20} className="text-gray-400 mt-0.5" />
                <div className="flex-1">
                  <div className="font-semibold text-gray-800">{t.type}: {t.from_location} → {t.to_location}</div>
                  <div className="flex gap-4 mt-1 text-sm text-gray-500 flex-wrap">
                    {t.departure_time && <span>Vertrek: {fmtDatetime(t.departure_time)}</span>}
                    {t.arrival_time && <span>Aankomst: {fmtDatetime(t.arrival_time)}</span>}
                    {t.booking_ref && <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">#{t.booking_ref}</span>}
                    {t.cost && <span className="font-medium" style={{ color: PALETTE.coralDeep }}>{fmtMoney(t.cost)}</span>}
                  </div>
                  {t.baggage_allowance && <div className="text-sm text-gray-500 mt-1 flex items-center gap-1.5"><Icon name="suitcase" size={14} />{t.baggage_allowance}</div>}
                  {t.notes && <div className="text-sm text-gray-500 mt-1">{t.notes}</div>}
                </div>
                <div className={readOnly ? "flex gap-1" : "opacity-0 group-hover:opacity-100 flex gap-1"}>
                  <button onClick={() => setEditing(t)} className="text-gray-400 hover:text-sky-600"><Icon name={readOnly ? "eye" : "pen"} size={16} /></button>
                  {!readOnly && <button onClick={() => handleDelete(t)} className="text-gray-400 hover:text-red-500" aria-label="Verwijderen"><Icon name="trash" size={16} /></button>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && <TransportForm tripId={trip.id} onSaved={() => { setShowForm(false); onRefresh(); }} onClose={() => setShowForm(false)} onImport={() => { setShowForm(false); setImporting(true); }} />}
      {editing && (
        <TransportForm tripId={trip.id} initial={editing}
          journalEntries={journal.filter((e) => e.transport_id === editing.id)} onJournalChange={loadJournal} currentUserId={currentUserId}
          photos={tripPhotos} onPhotosChange={loadPhotos} readOnly={readOnly} showPhotos
          onSaved={() => { setEditing(null); onRefresh(); }} onClose={() => setEditing(null)} />
      )}
      {importing && <ImportModal tripId={trip.id} onImported={() => { setImporting(false); onRefresh(); }} onClose={() => setImporting(false)} />}
    </div>
  );
}

// ---------- Budget tab ----------
function BudgetTab({ trip, expenses, transports, accommodations, days, onRefresh }) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);

  async function handleDelete(e) {
    await api.deleteExpense(e.id);
    onRefresh();
    toonMelding(`"${e.description || "Uitgave"}" verwijderd`, {
      label: "Ongedaan maken",
      run: async () => {
        await api.addExpense(trip.id, {
          date: e.date, category: e.category, description: e.description,
          amount: e.amount, paid_by: e.paid_by,
        });
        onRefresh();
      },
    });
  }

  const activities = days.flatMap((d) => d.activities || []);

  const transportTotal = transports.filter((t) => t.cost).reduce((s, t) => s + Number(t.cost), 0);
  const accommodationTotal = accommodations.filter((a) => a.cost).reduce((s, a) => s + Number(a.cost), 0);
  const activityTotal = activities.filter((a) => a.cost).reduce((s, a) => s + Number(a.cost), 0);
  const expenseTotal = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const total = expenseTotal + transportTotal + accommodationTotal + activityTotal;

  const budget = Number(trip.budget) || 0;
  const pct = budget > 0 ? Math.min(100, (total / budget) * 100) : null;

  const byCategory = EXPENSE_CATEGORIES.map((cat) => ({
    cat,
    total: expenses.filter((e) => e.category === cat).reduce((s, e) => s + Number(e.amount), 0),
  })).filter((x) => x.total > 0);

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-display text-[21px] text-gray-800">Budget & uitgaven</h3>
        <Button onClick={() => setShowForm(true)} variant="secondary">+ Uitgave toevoegen</Button>
      </div>

      {/* Summary */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 mb-5">
        <div className="flex justify-between items-end mb-3">
          <div>
            <div className="text-2xl font-bold text-gray-900">{fmtMoney(total, trip.currency)}</div>
            <div className="text-sm text-gray-500">van {budget > 0 ? fmtMoney(budget, trip.currency) : "geen budget ingesteld"}</div>
          </div>
          {pct !== null && (
            <div className={`text-lg font-bold ${pct > 90 ? "text-red-500" : pct > 70 ? "text-amber-600" : "text-green-600"}`}>
              {Math.round(pct)}%
            </div>
          )}
        </div>
        {pct !== null && (
          <div className="w-full bg-gray-100 rounded-full h-2.5">
            <div className={`h-2.5 rounded-full transition-all ${pct > 90 ? "bg-red-500" : pct > 70 ? "bg-yellow-400" : "bg-green-500"}`} style={{ width: `${pct}%` }} />
          </div>
        )}
        {byCategory.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-4">
            {byCategory.map(({ cat, total: t }) => (
              <div key={cat} className="bg-gray-50 rounded-lg px-3 py-2">
                <div className="text-xs text-gray-500">{cat}</div>
                <div className="font-semibold text-gray-800 text-sm">{fmtMoney(t, trip.currency)}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Expense list */}
      {expenses.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <Icon name="wallet" size={34} strokeWidth={1.2} className="mx-auto mb-3 text-gray-300" />
          <div>Nog geen uitgaven geregistreerd</div>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="divide-y divide-gray-50">
            {expenses.map((exp) => (
              <div key={exp.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 group">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-800 text-sm">{exp.description}</span>
                    <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{exp.category}</span>
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {fmt(exp.date)}{exp.paid_by ? ` · ${exp.paid_by}` : ""}
                  </div>
                </div>
                <div className="font-semibold text-gray-800">{fmtMoney(exp.amount, trip.currency)}</div>
                <div className="opacity-0 group-hover:opacity-100 flex gap-1">
                  <button onClick={() => setEditing(exp)} className="text-gray-400 hover:text-sky-700" aria-label="Bewerken"><Icon name="pen" size={14} /></button>
                  <button onClick={() => handleDelete(exp)} className="text-gray-400 hover:text-red-500" aria-label="Verwijderen"><Icon name="trash" size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Transports with cost */}
      {transports.some((t) => t.cost) && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex justify-between items-center">
            <span className="font-semibold text-gray-700 text-sm flex items-center gap-1.5"><Icon name="plane" size={14} className="text-gray-400" />Vervoer</span>
            <span className="font-semibold text-gray-800 text-sm">{fmtMoney(transportTotal, trip.currency)}</span>
          </div>
          <div className="divide-y divide-gray-50">
            {transports.filter((t) => t.cost).map((t) => (
              <div key={t.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 text-sm text-gray-800">{t.type}: {t.from_location} → {t.to_location}</div>
                <div className="font-semibold text-gray-800 text-sm">{fmtMoney(t.cost, trip.currency)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Accommodations with cost */}
      {accommodations.some((a) => a.cost) && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex justify-between items-center">
            <span className="font-semibold text-gray-700 text-sm flex items-center gap-1.5"><Icon name="bed" size={14} className="text-gray-400" />Verblijf</span>
            <span className="font-semibold text-gray-800 text-sm">{fmtMoney(accommodationTotal, trip.currency)}</span>
          </div>
          <div className="divide-y divide-gray-50">
            {accommodations.filter((a) => a.cost).map((a) => {
              const nights = (a.check_in && a.check_out)
                ? Math.round((new Date(a.check_out) - new Date(a.check_in)) / 86400000)
                : null;
              const perNight = nights > 0 ? Number(a.cost) / nights : null;
              return (
                <div key={a.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 text-sm text-gray-800">
                    {a.name}
                    {nights > 0 && <span className="ml-2 text-xs text-gray-400">{nights} nacht{nights !== 1 ? "en" : ""}</span>}
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-gray-800 text-sm">{fmtMoney(a.cost, trip.currency)}</div>
                    {perNight && <div className="text-xs text-gray-400">{fmtMoney(perNight, trip.currency)} / nacht</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Activities with cost */}
      {activities.some((a) => a.cost) && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex justify-between items-center">
            <span className="font-semibold text-gray-700 text-sm flex items-center gap-1.5"><Icon name="route" size={14} className="text-gray-400" />Activiteiten</span>
            <span className="font-semibold text-gray-800 text-sm">{fmtMoney(activityTotal, trip.currency)}</span>
          </div>
          <div className="divide-y divide-gray-50">
            {activities.filter((a) => a.cost).map((a) => (
              <div key={a.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 text-sm text-gray-800">{a.title}</div>
                <div className="font-semibold text-gray-800 text-sm">{fmtMoney(a.cost, trip.currency)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {showForm && <ExpenseForm tripId={trip.id} onSaved={() => { setShowForm(false); onRefresh(); }} onClose={() => setShowForm(false)} />}
      {editing && <ExpenseForm tripId={trip.id} initial={editing} onSaved={() => { setEditing(null); onRefresh(); }} onClose={() => setEditing(null)} />}
    </div>
  );
}
