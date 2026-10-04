export type Fields = Record<string, string>;
export type Result<T> = { ok: true; value: T } | { ok: false; fields: Fields };

export const phoneError = (p: string): string | null => {
  if (!p) return "Phone number is required.";
  const digits = p.replace(/\D/g, "");
  if (!/^[+\d][\d\s().-]*$/.test(p) || digits.length < 7 || digits.length > 15) return "Enter a valid phone number (7 to 15 digits).";
  return null;
};
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// eslint-disable-next-line no-control-regex
const CTRL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
export const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(CTRL, "").trim().slice(0, max) : "");
const COMMON = new Set(["password", "password1", "password123", "1234567890", "12345678910", "qwertyuiop", "qwerty12345", "iloveyou123", "admin12345", "welcome123", "letmein1234", "taxtrax1234", "pakistan123"]);

export function checkPassword(pw: unknown, email = "", name = ""): string | null {
  if (typeof pw !== "string" || !pw) return "Password is required.";
  if (pw.length < 10) return "Use at least 10 characters.";
  if (pw.length > 128) return "Password is too long (max 128 characters).";
  const l = pw.toLowerCase();
  if (COMMON.has(l) || /^(.)\1+$/.test(pw)) return "That password is too common. Choose something harder to guess.";
  const local = email.split("@")[0].toLowerCase();
  if (local.length >= 4 && l.includes(local)) return "Password must not contain your email address.";
  if (name.length >= 4 && l.includes(name.toLowerCase().replace(/\s+/g, ""))) return "Password must not contain your name.";
  if (!/[a-zA-Z]/.test(pw) || !/\d/.test(pw)) return "Include at least one letter and one number.";
  return null;
}

export function validateSignup(b: Record<string, unknown>): Result<{ name: string; email: string; password: string; phone: string }> {
  const f: Fields = {};
  const name = text(b.name, 100), email = text(b.email, 254).toLowerCase(), phone = text(b.phone, 40);
  if (name.length < 2) f.name = "Enter your full name.";
  if (!email) f.email = "Email is required."; else if (!EMAIL_RE.test(email)) f.email = "Enter a valid email address.";
  const pwErr = checkPassword(b.password, email, name);
  if (pwErr) f.password = pwErr;
  else if (b.confirm !== undefined && b.confirm !== b.password) f.confirm = "Passwords do not match.";
  if (phone && !/^[+\d][\d\s().-]{5,}$/.test(phone)) f.phone = "Enter a valid phone number or leave it blank.";
  return Object.keys(f).length ? { ok: false, fields: f } : { ok: true, value: { name, email, password: b.password as string, phone } };
}

export function validateContact(b: Record<string, unknown>): Result<{ name: string; email: string; phone: string; subject: string; service: string; message: string }> {
  const f: Fields = {};
  const name = text(b.name, 120), email = text(b.email, 254), subject = text(b.subject, 160), message = text(b.message, 4000);
  if (name.length < 2) f.name = "Please enter your name.";
  if (!email) f.email = "Email is required."; else if (!EMAIL_RE.test(email)) f.email = "Enter a valid email address.";
  const phoneVal = text(b.phone, 40), pe = phoneError(phoneVal); if (pe) f.phone = pe;
  if (subject.length < 3) f.subject = "Add a short subject (at least 3 characters).";
  if (message.length < 10) f.message = "Please write a few more words (at least 10 characters).";
  return Object.keys(f).length ? { ok: false, fields: f } : { ok: true, value: { name, email, subject, message, phone: phoneVal, service: text(b.service, 120) } };
}

export function validateBooking(b: Record<string, unknown>): Result<{ name: string; email: string; phone: string; date: string; time: string; service: string; revenue: string; timeline: string }> {
  const f: Fields = {};
  const name = text(b.name, 120), email = text(b.email, 254), phone = text(b.phone, 40), date = text(b.date, 20), time = text(b.time, 20);
  if (name.length < 2) f.name = "Please enter your full name.";
  if (!email) f.email = "Email is required."; else if (!EMAIL_RE.test(email)) f.email = "Enter a valid email address.";
  const pe = phoneError(phone); if (pe) f.phone = pe;
  if (!date) f.date = "Choose a date.";
  if (!time) f.time = "Choose a time.";
  return Object.keys(f).length ? { ok: false, fields: f } : { ok: true, value: { name, email, phone, date, time, service: text(b.service, 120), revenue: text(b.revenue, 60), timeline: text(b.timeline, 60) } };
}
