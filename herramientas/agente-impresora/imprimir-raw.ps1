# herramientas/agente-impresora/imprimir-raw.ps1 — manda bytes crudos a una impresora
# de Windows usando winspool (sin pasar por el driver ni compartir la impresora).
#
# Lo arranca agente.js y lo deja vivo: lee por stdin una linea por ticket con
# "<nombre de impresora><TAB><archivo>" y contesta "OK" o "ERR <motivo>".
# Se puede probar a mano:
#   echo "POS-80`tC:\ruta\ticket.bin" | powershell -ExecutionPolicy Bypass -File imprimir-raw.ps1

$codigo = @"
using System;
using System.Runtime.InteropServices;

public class ImpresoraRaw {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct DOCINFO {
    [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
  }

  [DllImport("winspool.drv", EntryPoint = "OpenPrinterW", CharSet = CharSet.Unicode, SetLastError = true)]
  static extern bool OpenPrinter(string nombre, out IntPtr h, IntPtr defaults);
  [DllImport("winspool.drv", SetLastError = true)]
  static extern bool ClosePrinter(IntPtr h);
  [DllImport("winspool.drv", EntryPoint = "StartDocPrinterW", CharSet = CharSet.Unicode, SetLastError = true)]
  static extern int StartDocPrinter(IntPtr h, int nivel, ref DOCINFO di);
  [DllImport("winspool.drv", SetLastError = true)]
  static extern bool EndDocPrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)]
  static extern bool StartPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)]
  static extern bool EndPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)]
  static extern bool WritePrinter(IntPtr h, byte[] datos, int largo, out int escritos);

  public static void Enviar(string impresora, byte[] datos) {
    IntPtr h;
    if (!OpenPrinter(impresora, out h, IntPtr.Zero))
      throw new Exception("No existe la impresora \"" + impresora + "\" en Windows (error " + Marshal.GetLastWin32Error() + ")");
    try {
      DOCINFO di = new DOCINFO();
      di.pDocName = "Ticket";
      di.pDataType = "RAW";
      if (StartDocPrinter(h, 1, ref di) == 0)
        throw new Exception("La impresora no acepta el trabajo (error " + Marshal.GetLastWin32Error() + ")");
      try {
        StartPagePrinter(h);
        int escritos;
        if (!WritePrinter(h, datos, datos.Length, out escritos) || escritos != datos.Length)
          throw new Exception("No se pudo escribir en la impresora (error " + Marshal.GetLastWin32Error() + ")");
        EndPagePrinter(h);
      } finally {
        EndDocPrinter(h);
      }
    } finally {
      ClosePrinter(h);
    }
  }
}
"@

try {
  Add-Type -TypeDefinition $codigo -ErrorAction Stop
} catch {
  [Console]::Out.WriteLine("ERR No se pudo cargar winspool: " + $_.Exception.Message)
  [Console]::Out.Flush()
  exit 1
}

while ($true) {
  $linea = [Console]::In.ReadLine()
  if ($null -eq $linea) { break }
  $partes = $linea -split "`t", 2
  if ($partes.Length -lt 2) {
    [Console]::Out.WriteLine("ERR Pedido invalido")
    [Console]::Out.Flush()
    continue
  }
  try {
    $datos = [System.IO.File]::ReadAllBytes($partes[1])
    [ImpresoraRaw]::Enviar($partes[0], $datos)
    [Console]::Out.WriteLine("OK")
  } catch {
    $msg = $_.Exception.Message
    if ($_.Exception.InnerException) { $msg = $_.Exception.InnerException.Message }
    [Console]::Out.WriteLine("ERR " + ($msg -replace "[\r\n]+", " "))
  }
  [Console]::Out.Flush()
}
