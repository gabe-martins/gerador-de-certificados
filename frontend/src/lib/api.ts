export class ApiError extends Error {
  constructor(
    public detail: any,
    public status: number,
  ) {
    super(typeof detail === "string" ? detail : "Revise os dados informados.");
  }
}
export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const result = await fetch(url, init);
  if (!result.ok) {
    let d;
    try {
      d = (await result.json()).detail;
    } catch {
      d = "Não foi possível concluir. Verifique a conexão e tente novamente.";
    }
    throw new ApiError(d, result.status);
  }
  return result.json();
}
export const json = (value: any): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(value),
});
