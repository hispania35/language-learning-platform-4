import { useState } from "react";
import { apiChangeAdminEmail } from "@/lib/api";

export default function AdminEmailBlock({ current }: { current?: string }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [needCode, setNeedCode] = useState(false);
  const [hint, setHint] = useState("");
  const [err, setErr] = useState("");
  const [done, setDone] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setErr(""); setDone("");
    if (!email.includes("@")) { setErr("Укажите корректную почту"); return; }
    if (needCode && code.length !== 6) { setErr("Введите код из 6 цифр"); return; }
    setBusy(true);
    const res = await apiChangeAdminEmail(email.trim(), needCode ? code : undefined).catch(() => null);
    setBusy(false);
    if (!res) { setErr("Нет связи с сервером"); return; }
    if (res.need_code) { setNeedCode(true); setHint(res.hint || ""); return; }
    if (res.error) { setErr(res.error); return; }
    setDone("Почта изменена");
    setEmail(""); setCode(""); setNeedCode(false);
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground font-ibm px-3 py-2 rounded-lg bg-muted">
        Код подтверждения придёт на текущую почту{current ? ` — ${current}` : ""}.
      </p>

      <input type="email" value={email} inputMode="email" autoComplete="off"
        onChange={e => { setEmail(e.target.value); setErr(""); }}
        placeholder="Новая почта администратора"
        className="w-full px-3 py-2.5 rounded-lg border border-border bg-muted/30 text-sm font-ibm outline-none focus:border-primary/40" />

      {needCode && (
        <div>
          <p className="text-xs text-muted-foreground font-ibm mb-1.5">
            Код из письма{hint ? ` на ${hint}` : ""}
          </p>
          <input value={code} inputMode="numeric"
            onChange={e => { setCode(e.target.value.replace(/\D/g, "").slice(0, 6)); setErr(""); }}
            placeholder="000000"
            className="w-full px-3 py-2.5 rounded-lg border border-border bg-muted/30 text-center text-lg font-montserrat font-black tracking-[0.4em] outline-none focus:border-primary/40" />
        </div>
      )}

      {err && <p className="text-xs text-red-600 font-ibm">{err}</p>}
      {done && <p className="text-xs text-green-700 font-ibm">{done}</p>}

      <button onClick={submit} disabled={busy}
        className="px-4 py-2 rounded-lg red-accent text-white text-xs font-montserrat font-bold hover:opacity-90 disabled:opacity-50">
        {busy ? "Отправляю..." : needCode ? "Подтвердить код и сменить" : "Получить код"}
      </button>
    </div>
  );
}
