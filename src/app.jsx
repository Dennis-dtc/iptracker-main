import { initUserSession } from "./services/userSessionService";

useEffect(() => {
  async function testAnon() {
    const user = await initUserSession("customer");
    console.log("👤 Anonymous user created:", user);
  }
  testAnon();
}, []);
