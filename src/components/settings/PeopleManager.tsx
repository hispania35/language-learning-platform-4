import { useEffect, useState, useCallback } from "react";
import Icon from "@/components/ui/icon";
import PersonCardForm, { type PersonFormValues } from "./PersonCardForm";
import {
  apiGetPeople, apiResetList, apiAdminSetPassword, apiAdminAddUser,
  apiAdminUpdateUser, apiAdminDeleteUser,
  type PersonCard, type PasswordReset,
} from "@/lib/api";

function randomPass() {
  return Math.random().toString(36).slice(-4) + Math.random().toString(36).slice(-4);
}

function PasswordRow({ person, onDone }: { person: PersonCard; onDone: (msg: string) => void }) {
  const [pass, setPass] = useState(randomPass());
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (pass.trim().length < 6) { onDone("Пароль не менее 6 символов"); return; }
    setBusy(true);
    const res = await apiAdminSetPassword(person.id, pass.trim()).catch(() => null);
    setBusy(false);
    onDone(res?.ok ? `Новый пароль для ${person.name}: ${pass.trim()}` : res?.error || "Не удалось сохранить");
  };

  return (
    <div className="flex flex-col sm:flex-row gap-2 mt-2">
      <input value={pass} onChange={e => setPass(e.target.value)}
        className="flex-1 px-3 py-2 rounded-lg border border-border bg-card text-sm font-ibm outline-none focus:border-primary/40" />
      <div className="flex gap-2">
        <button onClick={() => setPass(randomPass())} title="Сгенерировать"
          className="px-3 py-2 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
          <Icon name="RefreshCw" size={14} />
        </button>
        <button onClick={save} disabled={busy}
          className="px-4 py-2 rounded-lg red-accent text-white text-xs font-montserrat font-bold hover:opacity-90 disabled:opacity-50">
          {busy ? "..." : "Задать пароль"}
        </button>
      </div>
    </div>
  );
}

export default function PeopleManager() {
  const [teachers, setTeachers] = useState<PersonCard[]>([]);
  const [students, setStudents] = useState<PersonCard[]>([]);
  const [resets, setResets] = useState<PasswordReset[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [tab, setTab] = useState<"students" | "teachers">("students");
  const [search, setSearch] = useState("");
  const [passFor, setPassFor] = useState<number | null>(null);
  const [editing, setEditing] = useState<PersonCard | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState<number | null>(null);

  const load = useCallback(async () => {
    const [p, r] = await Promise.all([
      apiGetPeople().catch(() => null),
      apiResetList().catch(() => null),
    ]);
    if (p?.teachers) setTeachers(p.teachers);
    if (p?.students) setStudents(p.students);
    if (r?.resets) setResets(r.resets);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const list = tab === "students" ? students : teachers;
  const filtered = search.trim()
    ? list.filter(p => (p.name + p.email).toLowerCase().includes(search.trim().toLowerCase()))
    : list;

  const savePerson = async (v: PersonFormValues) => {
    setBusy(true);
    const res = editing
      ? await apiAdminUpdateUser({
          user_id: editing.id, name: v.name.trim(), email: v.email.trim(),
          level: v.level, phone: v.phone, telegram: v.telegram, note: v.note,
        }).catch(() => null)
      : await apiAdminAddUser({
          name: v.name.trim(), email: v.email.trim(), password: v.password.trim(),
          role: tab === "students" ? "student" : "teacher",
          level: v.level, phone: v.phone, telegram: v.telegram, note: v.note,
        }).catch(() => null);
    setBusy(false);
    if (!res?.ok) { setMsg(res?.error || "Не удалось сохранить"); return; }
    setMsg(editing ? "Карточка обновлена" : "Карточка создана");
    setEditing(null); setAdding(false);
    load();
  };

  const remove = async (p: PersonCard) => {
    setBusy(true);
    const res = await apiAdminDeleteUser(p.id).catch(() => null);
    setBusy(false);
    setConfirmDel(null);
    if (!res?.ok) { setMsg(res?.error || "Не удалось удалить"); return; }
    setMsg(`${p.name} удалён`);
    load();
  };

  if (loading) {
    return <p className="text-xs text-muted-foreground font-ibm mt-3">Загружаю списки...</p>;
  }

  return (
    <div className="mt-2 space-y-4">
      {/* Заявки на сброс */}
      <div>
        <p className="text-xs font-montserrat font-bold text-foreground mb-2 flex items-center gap-2">
          <Icon name="Inbox" size={14} className="text-primary" />
          Заявки на сброс пароля
          {resets.length > 0 && (
            <span className="px-1.5 py-0.5 rounded bg-primary text-white text-[10px]">{resets.length}</span>
          )}
        </p>
        {resets.length === 0 ? (
          <p className="text-xs text-muted-foreground font-ibm px-3 py-2 rounded-lg bg-muted">
            Новых заявок нет. Когда преподаватель или ученик запросит сброс, заявка появится здесь.
          </p>
        ) : (
          <div className="space-y-2">
            {resets.map(r => (
              <div key={r.id} className="rounded-lg border border-border p-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-montserrat font-bold text-foreground">{r.name}</span>
                  <span className="text-xs text-muted-foreground font-ibm">{r.email}</span>
                </div>
                <PasswordRow
                  person={{ id: r.user_id, name: r.name, email: r.email, role: "student" }}
                  onDone={m => { setMsg(m); load(); }}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Переключатель списков */}
      <div>
        <div className="flex bg-muted/50 rounded-xl p-1 mb-2">
          <button onClick={() => { setTab("students"); setEditing(null); setAdding(false); }}
            className={`flex-1 py-2 rounded-lg text-xs font-montserrat font-bold transition-all ${
              tab === "students" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"
            }`}>Ученики ({students.length})</button>
          <button onClick={() => { setTab("teachers"); setEditing(null); setAdding(false); }}
            className={`flex-1 py-2 rounded-lg text-xs font-montserrat font-bold transition-all ${
              tab === "teachers" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"
            }`}>Преподаватели ({teachers.length})</button>
        </div>

        <div className="flex gap-2 mb-2">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Поиск по имени или почте"
            className="flex-1 px-3 py-2 rounded-lg border border-border bg-muted/30 text-sm font-ibm outline-none focus:border-primary/40" />
          <button onClick={() => { setAdding(true); setEditing(null); }}
            className="px-3 py-2 rounded-lg red-accent text-white text-xs font-montserrat font-bold hover:opacity-90 flex items-center gap-1.5 flex-shrink-0">
            <Icon name="Plus" size={14} />Добавить
          </button>
        </div>

        {(adding || editing) && (
          <div className="mb-2">
            <PersonCardForm
              role={tab === "students" ? "student" : "teacher"}
              person={editing || undefined}
              busy={busy}
              onCancel={() => { setAdding(false); setEditing(null); }}
              onSave={savePerson}
            />
          </div>
        )}

        <div className="space-y-2">
          {filtered.length === 0 && (
            <p className="text-xs text-muted-foreground font-ibm px-3 py-2 rounded-lg bg-muted">Никого не найдено</p>
          )}
          {filtered.map(p => (
            <div key={p.id} className="rounded-lg border border-border p-3">
              <div className="flex items-center gap-2.5">
                <span className="w-8 h-8 rounded-full red-accent flex items-center justify-center flex-shrink-0">
                  <span className="text-white font-montserrat font-bold text-[11px]">{p.avatar || "??"}</span>
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-montserrat font-bold text-foreground truncate">{p.name}</p>
                  <p className="text-xs text-muted-foreground font-ibm truncate">
                    {p.email}{p.level ? ` · ${p.level}` : ""}
                    {p.role === "student" && p.lessons_count ? ` · ${p.lessons_count} ур.` : ""}
                  </p>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <button onClick={() => { setEditing(p); setAdding(false); setPassFor(null); }} title="Редактировать"
                    className="w-8 h-8 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                    <Icon name="Pencil" size={14} />
                  </button>
                  <button onClick={() => setPassFor(passFor === p.id ? null : p.id)} title="Сбросить пароль"
                    className="w-8 h-8 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                    <Icon name="KeyRound" size={14} />
                  </button>
                  <button onClick={() => setConfirmDel(confirmDel === p.id ? null : p.id)} title="Удалить"
                    className="w-8 h-8 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-red-600 hover:border-red-300 transition-colors">
                    <Icon name="Trash2" size={14} />
                  </button>
                </div>
              </div>

              {passFor === p.id && (
                <PasswordRow person={p} onDone={m => { setMsg(m); setPassFor(null); load(); }} />
              )}

              {confirmDel === p.id && (
                <div className="mt-2 rounded-lg bg-red-50 border border-red-200 p-2.5">
                  <p className="text-xs text-red-700 font-ibm mb-2">
                    Удалить {p.name}? Уроки, сообщения и домашние задания будут стёрты. Отменить нельзя.
                  </p>
                  <div className="flex gap-2">
                    <button onClick={() => remove(p)} disabled={busy}
                      className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-montserrat font-bold hover:opacity-90 disabled:opacity-50">
                      {busy ? "Удаляю..." : "Да, удалить"}
                    </button>
                    <button onClick={() => setConfirmDel(null)}
                      className="px-3 py-1.5 rounded-lg border border-border text-xs font-montserrat font-bold text-muted-foreground hover:text-foreground">
                      Отмена
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {msg && (
        <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-muted">
          <Icon name="Info" size={14} className="text-primary flex-shrink-0 mt-0.5" />
          <p className="text-xs text-foreground font-ibm flex-1 break-words">{msg}</p>
          <button onClick={() => setMsg("")} className="text-muted-foreground hover:text-foreground flex-shrink-0">
            <Icon name="X" size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
