
import { WallpaperProvider } from "./context/WallpaperContext";
import { ThemeProvider } from "./context/ThemeContext";
import ChatPage from "./pages/ChatPage";
import AuthPage from "./pages/AuthPage";
import { Navigate, Routes, Route } from "react-router";
import {useAuth} from "@clerk/react";


function App() {
  const {isSignedIn, isLoaded} = useAuth();

  if(!isLoaded) {
    return <div>Loading...</div>
  }

  return (
    <ThemeProvider>
      <WallpaperProvider>
        <Routes>
          <Route path="/" element={ isSignedIn ? <ChatPage /> : <Navigate to={"/auth"} replace />} />
          <Route
            path="/auth"
            element={!isSignedIn ? <AuthPage /> : <Navigate to={"/"} replace />}
          />
        </Routes>
      </WallpaperProvider>
    </ThemeProvider>
  );
}

export default App;
