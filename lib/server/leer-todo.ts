// lib/server/leer-todo.ts — lee TODAS las filas de una consulta, de a paginas.
//
// PostgREST corta cada respuesta en 1000 filas (o menos, segun el proyecto):
// un .limit(5000) devuelve 1000 sin avisar. Se avanza por lo que realmente
// vino y se corta recien con una pagina vacia, asi sale completo con
// cualquier tope. La consulta tiene que tener un orden estable (ej. por id).
const PAGINA = 1000;

type Resultado<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

export async function leerTodo<T>(pagina: (desde: number, hasta: number) => Resultado<T>, maximo = Infinity): Promise<T[]> {
  const filas: T[] = [];
  while (filas.length < maximo) {
    const { data, error } = await pagina(filas.length, filas.length + PAGINA - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    filas.push(...data);
  }
  return filas.slice(0, maximo);
}
