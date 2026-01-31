import { exec } from "child_process";
import { promisify } from "util";
import { platform } from "os";

const execAsync = promisify(exec);

export const selectFolder = async (): Promise<string | null> => {
  const os = platform();

  try {
    if (os === "darwin") {
      // macOS: 使用 osascript
      const { stdout } = await execAsync(
        `osascript -e 'set folderPath to POSIX path of (choose folder with prompt "Select a project folder")' -e 'return folderPath'`
      );
      const path = stdout.trim();
      return path || null;
    } else if (os === "win32") {
      // Windows: 使用 PowerShell
      const { stdout } = await execAsync(
        `powershell -Command "Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.FolderBrowserDialog; $f.ShowDialog() | Out-Null; $f.SelectedPath"`
      );
      const path = stdout.trim();
      return path || null;
    } else {
      // Linux: 尝试 zenity，然后 kdialog
      try {
        const { stdout } = await execAsync(
          `zenity --file-selection --directory --title="Select a project folder"`
        );
        return stdout.trim() || null;
      } catch {
        try {
          const { stdout } = await execAsync(
            `kdialog --getexistingdirectory ~`
          );
          return stdout.trim() || null;
        } catch {
          throw new Error("No file dialog available. Please install zenity or kdialog.");
        }
      }
    }
  } catch (error) {
    // 用户取消选择
    return null;
  }
};
