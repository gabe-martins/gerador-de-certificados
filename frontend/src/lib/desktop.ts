declare global {
  interface Window {
    pagelsDesktop?: {
      portable: boolean;
      version: string;
      openDataFolder: () => Promise<string>;
    };
  }
}

export const desktop = window.pagelsDesktop;
