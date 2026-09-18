const AUTH_URL = "https://functions.poehali.dev/8e1fb776-5df3-4087-84d5-894ba0980004";
const HOMEWORK_URL = "https://functions.poehali.dev/ada0a99c-976c-4672-bfd4-ae6d47384e64";
const API_URL = "https://functions.poehali.dev/e7c17244-0dc8-4e62-b8d4-2e668d7af9d1";
const LIBRARY_URL = "https://functions.poehali.dev/5b3dca5a-a2f2-4bfb-a41e-c63f332038b0";
const CARDS_URL = "https://functions.poehali.dev/739af8e4-6a45-4257-afe4-8552e71a4946";
const EXERCISES_URL = "https://functions.poehali.dev/a3801aae-f34e-4706-8b57-1d1f4bb3fbc2";

function getToken(): string {
  return localStorage.getItem("hispania_token") || "";
}

function authHeaders() {
  return { "Content-Type": "application/json", "X-Auth-Token": getToken() };
}

async function request(url: string, options: RequestInit = {}) {
  const res = await fetch(url, { ...options, headers: { ...(options.headers as object), ...authHeaders() } });
  const text = await res.text();
  let data: unknown;
  try { data = JSON.parse(text); } catch { data = text; }
  // Функция может вернуть body как строку-JSON
  if (typeof data === "string") {
    try { data = JSON.parse(data as string); } catch { /* ok */ }
  }
  return { status: res.status, data };
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export async function apiLogin(email: string, password: string) {
  const r = await request(AUTH_URL, {
    method: "POST",
    body: JSON.stringify({ action: "login", email, password }),
  });
  return r.data as { token?: string; user?: ApiUser; twofa?: boolean; user_id?: number; hint?: string; error?: string };
}

export async function apiVerifyCode(user_id: number, code: string) {
  const r = await request(AUTH_URL, {
    method: "POST",
    body: JSON.stringify({ action: "verify_code", user_id, code }),
  });
  return r.data as { token?: string; user?: ApiUser; error?: string };
}

export async function apiResendCode(user_id: number) {
  const r = await request(AUTH_URL, {
    method: "POST",
    body: JSON.stringify({ action: "resend_code", user_id }),
  });
  return r.data as { ok?: boolean; hint?: string; error?: string };
}

export async function apiRegister(name: string, email: string, password: string, role: string, level?: string) {
  const r = await request(AUTH_URL, {
    method: "POST",
    body: JSON.stringify({ action: "register", name, email, password, role, level }),
  });
  return r.data as { token?: string; user?: ApiUser; error?: string };
}

export async function apiMe() {
  const r = await request(AUTH_URL);
  return r.data as { user?: ApiUser; error?: string };
}

export async function apiLogout() {
  await request(AUTH_URL, { method: "POST", body: JSON.stringify({ action: "logout" }) });
  localStorage.removeItem("hispania_token");
}

export async function apiResetRequest(email: string) {
  const r = await request(AUTH_URL, { method: "POST", body: JSON.stringify({ action: "reset_request", email }) });
  return r.data as { ok?: boolean; already?: boolean; error?: string };
}

export async function apiResetList() {
  const r = await request(AUTH_URL + "?p=reset_list");
  return r.data as { resets?: PasswordReset[]; error?: string };
}

export async function apiResetDo(reset_id: number, user_id: number, new_password: string) {
  const r = await request(AUTH_URL, { method: "POST", body: JSON.stringify({ action: "reset_do", reset_id, user_id, new_password }) });
  return r.data as { ok?: boolean; error?: string };
}

export async function apiChangePassword(old_password: string, new_password: string, code?: string) {
  const r = await request(AUTH_URL, { method: "POST", body: JSON.stringify({ action: "change_password", old_password, new_password, code }) });
  return r.data as { ok?: boolean; need_code?: boolean; hint?: string; error?: string };
}

// ── Homework ──────────────────────────────────────────────────────────────────

export async function apiGetHomework() {
  const r = await request(HOMEWORK_URL);
  return r.data as { homework?: HomeworkItem[]; error?: string };
}

export async function apiCreateHomework(data: CreateHomeworkData) {
  const r = await request(HOMEWORK_URL, { method: "POST", body: JSON.stringify(data) });
  return r.data as { ok?: boolean; id?: number; error?: string };
}

export async function apiUpdateHomework(data: UpdateHomeworkData) {
  const r = await request(HOMEWORK_URL + "?p=update", { method: "POST", body: JSON.stringify(data) });
  return r.data as { ok?: boolean; error?: string };
}

export async function apiGetStudents() {
  const r = await request(API_URL + "?p=students");
  return r.data as { students?: StudentInfo[]; error?: string };
}

export interface Profile {
  id: number;
  name: string;
  email: string;
  role: string;
  level?: string;
  avatar?: string;
  phone?: string;
  social_name?: string;
  social_url?: string;
  telegram?: string;
  whatsapp?: string;
  about?: string;
  notify_email?: boolean;
  notify_new_lesson?: boolean;
  notify_cancel?: boolean;
  notify_chat?: boolean;
}

export async function apiGetProfile() {
  const r = await request(API_URL + "?p=profile");
  return r.data as { profile?: Profile; error?: string };
}

export async function apiUpdateProfile(data: Partial<Profile>) {
  const r = await request(API_URL + "?p=profile", { method: "PUT", body: JSON.stringify(data) });
  return r.data as { profile?: Profile; error?: string };
}

export async function apiCancelLesson(lessonId: number, reason: string) {
  const r = await request(API_URL + "?p=lesson_cancel", {
    method: "POST",
    body: JSON.stringify({ lesson_id: lessonId, reason }),
  });
  return r.data as { ok?: boolean; error?: string };
}

export async function apiStartLesson(lessonId: number, joinUrl?: string) {
  const r = await request(API_URL + "?p=lesson_start", {
    method: "POST",
    body: JSON.stringify({ lesson_id: lessonId, join_url: joinUrl || "" }),
  });
  return r.data as { ok?: boolean; room_url?: string; notified?: number; emails_sent?: number; error?: string };
}

export async function apiUpdateStudent(data: {
  id: number;
  email: string;
  name?: string;
  level?: string;
  phone?: string;
  social_name?: string;
  social_url?: string;
  note?: string;
}) {
  const r = await request(API_URL + "?p=students", { method: "PUT", body: JSON.stringify(data) });
  return r.data as { ok?: boolean; error?: string };
}

// ── API (materials, calendar, chat, notifications) ────────────────────────────

export async function apiGetMaterials() {
  const r = await request(API_URL + "?p=materials");
  return r.data as {
    materials?: Material[];
    limits?: Record<string, number>;
    storage_ready?: boolean;
    error?: string;
  };
}

export async function apiCreateMaterial(data: CreateMaterialData) {
  const r = await request(API_URL + "?p=materials", { method: "POST", body: JSON.stringify(data) });
  return r.data as { ok?: boolean; id?: number; error?: string };
}

export async function apiDeleteMaterial(id: number) {
  const r = await request(`${API_URL}?p=materials&id=${id}`, { method: "DELETE", body: JSON.stringify({ id }) });
  return r.data as { ok?: boolean; error?: string };
}

/** Прикрепить материал к ученикам, группе или занятиям */
export async function apiAssignMaterial(data: {
  material_id: number;
  student_ids?: number[];
  lesson_ids?: number[];
  group_id?: number;
}) {
  const r = await request(API_URL + "?p=material_assign", { method: "POST", body: JSON.stringify(data) });
  return r.data as { ok?: boolean; students?: number; lessons?: number; error?: string };
}

/** Загрузка файла материала прямо в облако + создание карточки */
export async function apiUploadMaterial(
  file: File,
  meta: CreateMaterialData,
  onProgress?: (percent: number) => void,
) {
  const mime = file.type || "application/octet-stream";
  const slot = await request(API_URL + "?p=material_upload_url", {
    method: "POST",
    body: JSON.stringify({ file_name: file.name, mime, size: file.size, category: meta.category }),
  });
  const s = slot.data as { upload_url?: string; key?: string; error?: string };
  if (!s.upload_url || !s.key) return { error: s.error || "Не удалось начать загрузку" };

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", s.upload_url as string);
    xhr.setRequestHeader("Content-Type", mime);
    xhr.upload.onprogress = e => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`HTTP ${xhr.status}`)));
    xhr.onerror = () => reject(new Error("network"));
    xhr.send(file);
  });

  const r = await request(API_URL + "?p=materials", {
    method: "POST",
    body: JSON.stringify({
      ...meta,
      file_key: s.key,
      file_name: file.name,
      mime,
      size: file.size,
    }),
  });
  return r.data as { ok?: boolean; id?: number; error?: string };
}

export async function apiGetCalendar() {
  const r = await request(API_URL + "?p=calendar");
  return r.data as { lessons?: Lesson[]; error?: string };
}

export async function apiCreateLesson(data: CreateLessonData) {
  const r = await request(API_URL + "?p=calendar", { method: "POST", body: JSON.stringify(data) });
  return r.data as { ok?: boolean; id?: number; error?: string };
}

export async function apiGetGroups() {
  const r = await request(API_URL + "?p=groups");
  return r.data as { groups?: StudentGroup[]; error?: string };
}

export async function apiCreateGroup(data: GroupData) {
  const r = await request(API_URL + "?p=groups", { method: "POST", body: JSON.stringify(data) });
  return r.data as { ok?: boolean; id?: number; error?: string };
}

export async function apiUpdateGroup(data: GroupData) {
  const r = await request(API_URL + "?p=groups", { method: "PUT", body: JSON.stringify(data) });
  return r.data as { ok?: boolean; error?: string };
}

export async function apiDeleteGroup(id: number) {
  const r = await request(`${API_URL}?p=groups&id=${id}`, { method: "DELETE", body: JSON.stringify({ id }) });
  return r.data as { ok?: boolean; error?: string };
}

export async function apiUpdateLesson(data: {
  id: number;
  lesson_date: string;
  lesson_time: string;
  topic?: string;
  lesson_type?: string;
  duration_min?: number;
  student_ids?: number[];
}) {
  const r = await request(API_URL + "?p=calendar", { method: "PUT", body: JSON.stringify(data) });
  return r.data as { ok?: boolean; error?: string };
}

export async function apiMoveLesson(data: { id: number; lesson_date: string; lesson_time: string }) {
  const r = await request(API_URL + "?p=calendar", { method: "PUT", body: JSON.stringify(data) });
  return r.data as { ok?: boolean; error?: string };
}

export async function apiDeleteLesson(id: number) {
  const r = await request(`${API_URL}?p=calendar&id=${id}`, { method: "DELETE", body: JSON.stringify({ id }) });
  return r.data as { ok?: boolean; error?: string };
}

export async function apiGetMessages(withUserId?: number) {
  const url = withUserId ? `${API_URL}?p=chat&with=${withUserId}` : `${API_URL}?p=chat`;
  const r = await request(url);
  return r.data as { messages?: ChatMessage[]; typing?: boolean; error?: string };
}

export interface UnreadMessage {
  id: number;
  from_user_id: number;
  from_name: string;
  preview: string;
  created_at: string;
}

export async function apiChatPing() {
  const r = await request(API_URL + "?p=chat_ping", { method: "POST", body: "{}" });
  return r.data as { ok?: boolean; unread?: number; messages?: UnreadMessage[]; error?: string };
}

export async function apiPinMessage(id: number, pin: boolean) {
  const r = await request(API_URL + "?p=chat_pin", { method: "POST", body: JSON.stringify({ id, pin }) });
  return r.data as { ok?: boolean; error?: string };
}

export async function apiSetTyping(peerId: number) {
  await request(API_URL + "?p=chat_typing", { method: "POST", body: JSON.stringify({ peer_id: peerId }) });
}

export async function apiGetChatContacts() {
  const r = await request(API_URL + "?p=chat_contacts");
  return r.data as { contacts?: ChatContact[]; groups?: ChatGroup[]; error?: string };
}

/** Загрузить вложение чата напрямую в облако, вернуть ключ файла */
export async function apiUploadChatFile(
  file: Blob,
  fileName: string,
  onProgress?: (percent: number) => void,
) {
  const mime = file.type || "application/octet-stream";
  const slot = await request(API_URL + "?p=chat_upload_url", {
    method: "POST",
    body: JSON.stringify({ file_name: fileName, mime, size: file.size }),
  });
  const s = slot.data as { upload_url?: string; key?: string; error?: string };
  if (!s.upload_url || !s.key) return { error: s.error || "Не удалось начать загрузку" };

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", s.upload_url as string);
    xhr.setRequestHeader("Content-Type", mime);
    xhr.upload.onprogress = e => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`HTTP ${xhr.status}`)));
    xhr.onerror = () => reject(new Error("network"));
    xhr.send(file);
  });

  return { key: s.key };
}

export async function apiSendMessage(payload: {
  to_user_id?: number;
  group_id?: number;
  text?: string;
  file_key?: string;
  file_data?: string;
  file_name?: string;
  file_type?: string;
  mime?: string;
  audio_sec?: number;
}) {
  const r = await request(API_URL + "?p=chat", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return r.data as { ok?: boolean; id?: number; sent?: number; error?: string };
}

export async function apiEditMessage(id: number, text: string) {
  const r = await request(API_URL + "?p=chat", { method: "PUT", body: JSON.stringify({ id, text }) });
  return r.data as { ok?: boolean; error?: string };
}

export async function apiDeleteMessage(id: number, scope: "me" | "all") {
  const r = await request(`${API_URL}?p=chat&id=${id}&scope=${scope}`, {
    method: "DELETE", body: JSON.stringify({ id, scope }),
  });
  return r.data as { ok?: boolean; error?: string };
}

export async function apiGetNotifications() {
  const r = await request(API_URL + "?p=notifications");
  return r.data as { notifications?: Notification[]; unread?: number; error?: string };
}

export async function apiMarkNotificationsRead() {
  await request(API_URL + "?p=notifications_read", { method: "POST", body: "{}" });
}

export async function apiGetLeaderboard() {
  const r = await request(API_URL + "?p=leaderboard");
  return r.data as { leaderboard?: LeaderboardEntry[]; error?: string };
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ApiUser {
  id: number;
  name: string;
  role: "student" | "teacher" | "admin";
  level?: string;
  avatar: string;
}

export interface HomeworkItem {
  id: number;
  title: string;
  description: string;
  subject: string;
  due_date: string;
  status: "pending" | "inprogress" | "review" | "done";
  grade?: number;
  teacher_comment?: string;
  student_answer?: string;
  student_name?: string;
  student_avatar?: string;
  teacher_name?: string;
  teacher_avatar?: string;
  created_at: string;
}

export interface CreateHomeworkData {
  student_id: number;
  title: string;
  description?: string;
  subject?: string;
  due_date?: string;
}

export interface UpdateHomeworkData {
  id: number;
  status?: string;
  student_answer?: string;
  grade?: number;
  teacher_comment?: string;
}

export interface StudentInfo {
  id: number;
  name: string;
  avatar: string;
  level?: string;
  lessons_count?: number;
  email?: string;
  phone?: string;
  social_name?: string;
  social_url?: string;
  note?: string;
}

export interface StudentGroup {
  id: number;
  name: string;
  description: string;
  color: string;
  students: StudentInfo[];
}

export interface GroupData {
  id?: number;
  name: string;
  description?: string;
  color?: string;
  student_ids?: number[];
}

export interface MaterialLessonRef {
  id: number;
  topic: string;
  lesson_date: string;
  lesson_time: string;
}

export interface Material {
  id: number;
  title: string;
  description: string;
  category: string;
  file_type: string;
  file_size: string;
  file_url?: string;
  created_at: string;
  teacher_name: string;
  students?: LessonStudent[];
  lessons?: MaterialLessonRef[];
}

export interface CreateMaterialData {
  title: string;
  description?: string;
  category?: string;
  file_type?: string;
  file_size?: string;
  file_url?: string;
  file_key?: string;
  file_name?: string;
  mime?: string;
  size?: number;
}

export interface LessonStudent {
  id: number;
  name: string;
  avatar: string;
}

export interface Lesson {
  id: number;
  title: string;
  topic: string;
  lesson_date: string;
  lesson_time: string;
  duration_min: number;
  lesson_type: string;
  students?: LessonStudent[];
}

export interface CreateLessonData {
  topic: string;
  lesson_date: string;
  lesson_time: string;
  title?: string;
  duration_min?: number;
  lesson_type?: string;
  student_ids?: number[];
}

export interface ChatMessage {
  id: number;
  from_user_id: number;
  to_user_id: number;
  text: string;
  is_read: boolean;
  created_at: string;
  from_name: string;
  from_avatar: string;
  file_url?: string;
  file_name?: string;
  file_type?: string;
  audio_sec?: number;
  group_id?: number | null;
  edited_at?: string | null;
  pinned_at?: string | null;
}

export interface ChatContact {
  id: number;
  name: string;
  avatar: string;
  level?: string;
  last_text?: string;
  last_at?: string | null;
  unread?: number;
  online?: boolean;
}

export interface ChatGroup {
  id: number;
  name: string;
  color?: string;
  students: { id: number; name: string; avatar: string }[];
}

export interface Notification {
  id: number;
  text: string;
  type: string;
  is_read: boolean;
  created_at: string;
}

export interface PasswordReset {
  id: number;
  user_id: number;
  name: string;
  email: string;
  status: string;
  created_at: string;
}

export interface LeaderboardEntry {
  id: number;
  name: string;
  avatar: string;
  level?: string;
  score: number;
}

// ── Библиотека ────────────────────────────────────────────────────────────────

export interface LibraryItem {
  id: number;
  title: string;
  author?: string;
  description?: string;
  kind: "book" | "audio" | "video";
  file_url: string;
  download_url?: string;
  file_name?: string;
  mime?: string;
  size_bytes?: number;
  duration_sec?: number;
  created_at?: string;
  subject_id?: number | null;
  students?: { id: number; name: string; avatar: string }[];
}

export interface LibrarySubject {
  id: number;
  name: string;
  color?: string;
  parent_id?: number | null;
}

export async function apiGetLibrary() {
  const r = await request(LIBRARY_URL);
  return r.data as {
    items?: LibraryItem[]; subjects?: LibrarySubject[];
    direct_upload?: boolean; max_mb?: number; error?: string;
  };
}

export async function apiAddLibrarySubject(name: string, color?: string, parentId?: number | null) {
  const r = await request(LIBRARY_URL + "?p=add_subject", {
    method: "POST", body: JSON.stringify({ name, color, parent_id: parentId ?? null }),
  });
  return r.data as {
    ok?: boolean; id?: number; name?: string; color?: string;
    parent_id?: number | null; error?: string;
  };
}

export async function apiRenameLibrarySubject(id: number, name: string, color?: string) {
  const r = await request(LIBRARY_URL + "?p=rename_subject", {
    method: "POST", body: JSON.stringify({ id, name, color }),
  });
  return r.data as { ok?: boolean; error?: string };
}

export async function apiDeleteLibrarySubject(id: number) {
  const r = await request(LIBRARY_URL + "?p=del_subject", {
    method: "POST", body: JSON.stringify({ id }),
  });
  return r.data as { ok?: boolean; error?: string };
}

/** Загрузка большого файла: берём ссылку, льём файл прямо в облако, затем создаём карточку */
export async function apiUploadLibraryLarge(
  file: File,
  meta: { title: string; author?: string; description?: string; duration_sec?: number; subject_id?: number | null },
  onProgress?: (percent: number) => void,
) {
  const mime = file.type || "application/octet-stream";
  const slot = await request(LIBRARY_URL + "?p=upload_url", {
    method: "POST",
    body: JSON.stringify({ file_name: file.name, mime, size: file.size }),
  });
  const s = slot.data as { upload_url?: string; key?: string; error?: string };
  if (!s.upload_url || !s.key) return { error: s.error || "Не удалось начать загрузку" };

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", s.upload_url as string);
    xhr.setRequestHeader("Content-Type", mime);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`HTTP ${xhr.status}`)));
    xhr.onerror = () => reject(new Error("network"));
    xhr.send(file);
  });

  const r = await request(LIBRARY_URL + "?p=confirm", {
    method: "POST",
    body: JSON.stringify({ ...meta, key: s.key, file_name: file.name, mime, size: file.size }),
  });
  return r.data as { ok?: boolean; id?: number; file_url?: string; kind?: string; error?: string };
}

export async function apiUploadLibraryItem(data: {
  title: string;
  author?: string;
  description?: string;
  file_data: string;
  file_name: string;
  mime: string;
  duration_sec?: number;
  subject_id?: number | null;
}) {
  const r = await request(LIBRARY_URL, { method: "POST", body: JSON.stringify(data) });
  return r.data as { ok?: boolean; id?: number; file_url?: string; kind?: string; error?: string };
}

export async function apiDeleteLibraryItem(id: number) {
  const r = await request(`${LIBRARY_URL}?id=${id}`, { method: "DELETE", body: JSON.stringify({ id }) });
  return r.data as { ok?: boolean; error?: string };
}

export async function apiAssignLibraryItem(data: { item_id: number; student_ids?: number[]; group_id?: number }) {
  const r = await request(LIBRARY_URL + "?p=assign", { method: "POST", body: JSON.stringify(data) });
  return r.data as { ok?: boolean; assigned?: number; error?: string };
}
// ── Карточки слов ─────────────────────────────────────────────────────────────

export interface CardProgress {
  known: boolean;
  attempts: number;
  correct: number;
}

export interface WordCard {
  id?: number;
  front: string;
  back: string;
  example?: string;
  example_ru?: string;
  progress?: CardProgress;
}

export interface CardDeck {
  id: number;
  title: string;
  description?: string;
  lang_from: string;
  lang_to: string;
  created_at: string;
  cards: WordCard[];
  students: LessonStudent[];
}

export async function apiGetDecks() {
  const r = await request(CARDS_URL);
  return r.data as { decks?: CardDeck[]; ai_ready?: boolean; error?: string };
}

export async function apiTranslateWords(data: {
  words: string;
  lang_from?: string;
  lang_to?: string;
  with_examples?: boolean;
}) {
  const r = await request(CARDS_URL + "?p=translate", { method: "POST", body: JSON.stringify(data) });
  return r.data as { cards?: WordCard[]; error?: string };
}

export async function apiCreateDeck(data: {
  title: string;
  description?: string;
  lang_from?: string;
  lang_to?: string;
  cards: WordCard[];
  student_ids?: number[];
}) {
  const r = await request(CARDS_URL, { method: "POST", body: JSON.stringify(data) });
  return r.data as { ok?: boolean; id?: number; count?: number; error?: string };
}

export async function apiAssignDeck(data: { deck_id: number; student_ids?: number[]; group_id?: number }) {
  const r = await request(CARDS_URL + "?p=assign", { method: "POST", body: JSON.stringify(data) });
  return r.data as { ok?: boolean; students?: number; error?: string };
}

export async function apiCardProgress(data: { card_id: number; known?: boolean; correct?: boolean }) {
  const r = await request(CARDS_URL + "?p=progress", { method: "POST", body: JSON.stringify(data) });
  return r.data as { ok?: boolean; error?: string };
}

export async function apiDeleteDeck(id: number) {
  const r = await request(`${CARDS_URL}?id=${id}`, { method: "DELETE", body: JSON.stringify({ id }) });
  return r.data as { ok?: boolean; error?: string };
}
// ── WebRTC signaling ─────────────────────────────────────────────────────────

export interface RtcSignal { id: number; from: number; kind: string; payload: string }
export interface RtcPeer { id: number; name: string }

export async function apiRtcPoll(room: string, since: number) {
  const r = await request(`${API_URL}?p=rtc&room=${encodeURIComponent(room)}&since=${since}`);
  return r.data as { signals?: RtcSignal[]; peers?: RtcPeer[]; last_id?: number; me?: number; error?: string };
}

export async function apiRtcSend(room: string, kind: string, payload: unknown) {
  const r = await request(API_URL + "?p=rtc", {
    method: "POST",
    body: JSON.stringify({ room, kind, payload }),
  });
  return r.data as { ok?: boolean; error?: string };
}

export async function apiRtcLeave(room: string) {
  await request(`${API_URL}?p=rtc&room=${encodeURIComponent(room)}`, { method: "DELETE" });
}

// ── Интерактивные задания ────────────────────────────────────────────────────

export type ExTemplate = "quiz" | "match" | "gaps" | "order" | "truefalse" | "cards";

export interface ExItem {
  question?: string;
  options?: string[];
  answer?: number | string | boolean;
  left?: string;
  right?: string;
  text?: string;
  sentence?: string;
  hint?: string;
  statement?: string;
}

export interface ExResult {
  name: string;
  score: number;
  total: number;
  seconds: number;
  created_at: string;
}

export interface Exercise {
  id: number;
  title: string;
  template: ExTemplate;
  subject?: string;
  instruction?: string;
  items: ExItem[];
  created_at: string;
  students: { id: number; name: string; avatar: string }[];
  results: ExResult[];
}

export async function apiGetExercises() {
  const r = await request(EXERCISES_URL);
  return r.data as { exercises?: Exercise[]; ai_ready?: boolean; error?: string };
}

export async function apiGenerateExercise(data: {
  template: ExTemplate;
  topic: string;
  count?: number;
  level?: string;
}) {
  const r = await request(EXERCISES_URL + "?p=generate", { method: "POST", body: JSON.stringify(data) });
  return r.data as { items?: ExItem[]; error?: string };
}

export async function apiCreateExercise(data: {
  title: string;
  template: ExTemplate;
  subject?: string;
  instruction?: string;
  items: ExItem[];
  student_ids?: number[];
}) {
  const r = await request(EXERCISES_URL, { method: "POST", body: JSON.stringify(data) });
  return r.data as { ok?: boolean; id?: number; count?: number; error?: string };
}

export async function apiUpdateExercise(data: {
  id: number;
  title: string;
  subject?: string;
  instruction?: string;
  items: ExItem[];
}) {
  const r = await request(EXERCISES_URL, { method: "PUT", body: JSON.stringify(data) });
  return r.data as { ok?: boolean; error?: string };
}

export async function apiAssignExercise(exercise_id: number, student_ids: number[]) {
  const r = await request(EXERCISES_URL + "?p=assign", {
    method: "POST",
    body: JSON.stringify({ exercise_id, student_ids }),
  });
  return r.data as { ok?: boolean; students?: number; error?: string };
}

export async function apiSaveExResult(data: {
  exercise_id: number;
  score: number;
  total: number;
  seconds: number;
}) {
  const r = await request(EXERCISES_URL + "?p=result", { method: "POST", body: JSON.stringify(data) });
  return r.data as { ok?: boolean; error?: string };
}

export async function apiDeleteExercise(id: number) {
  const r = await request(`${EXERCISES_URL}?id=${id}`, { method: "DELETE" });
  return r.data as { ok?: boolean; error?: string };
}

// ── Settings ──────────────────────────────────────────────────────────────────

export interface HomeBlockPref { id: string; on: boolean }

export interface AppSettings {
  home_blocks: HomeBlockPref[];
  schedule_mode: "assigned" | "booking";
  video_platform: string;
  video_link: string;
  notify_chat_sound: boolean;
  notify_chat_toast: boolean;
  notify_chat_email: boolean;
}

export async function apiGetSettings() {
  const r = await request(`${API_URL}?p=settings`);
  return r.data as { settings?: AppSettings; inherited?: string[]; error?: string };
}

export async function apiSaveSettings(settings: Partial<AppSettings>) {
  const r = await request(`${API_URL}?p=settings`, { method: "POST", body: JSON.stringify({ settings }) });
  return r.data as { ok?: boolean; settings?: AppSettings; error?: string };
}

// ── Slots ─────────────────────────────────────────────────────────────────────

export interface LessonSlot {
  id: number;
  date: string;
  time: string;
  duration_min: number;
  booked_by: number | null;
  booked_name: string;
  mine: boolean;
}

export async function apiGetSlots() {
  const r = await request(`${API_URL}?p=slots`);
  return r.data as { slots?: LessonSlot[]; error?: string };
}

export async function apiCreateSlots(slots: { date: string; time: string }[], duration_min = 60) {
  const r = await request(`${API_URL}?p=slots`, { method: "POST", body: JSON.stringify({ slots, duration_min }) });
  return r.data as { ok?: boolean; added?: number; error?: string };
}

export async function apiDeleteSlot(id: number) {
  const r = await request(`${API_URL}?p=slots&id=${id}`, { method: "DELETE" });
  return r.data as { ok?: boolean; error?: string };
}

export async function apiBookSlot(slot_id: number, cancel = false) {
  const r = await request(`${API_URL}?p=slot_book`, { method: "POST", body: JSON.stringify({ slot_id, cancel }) });
  return r.data as { ok?: boolean; lesson_id?: number; error?: string };
}
