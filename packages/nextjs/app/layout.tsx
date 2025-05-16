import { AppWithProviders } from "~~/components/ScaffoldEthAppWithProviders";
import { ThemeProvider } from "~~/components/ThemeProvider";
import "~~/styles/globals.css";

export const metadata = {
  title: "BuidlGuidl Streams",
  description: "Process and analyze CSV transaction data",
  icons: {
    icon: "/favicon.ico",
  },
};

const App = ({ children }: { children: React.ReactNode }) => {
  return (
    <html suppressHydrationWarning>
      <body>
        <ThemeProvider enableSystem>
          <AppWithProviders>{children}</AppWithProviders>
        </ThemeProvider>
      </body>
    </html>
  );
};

export default App;
