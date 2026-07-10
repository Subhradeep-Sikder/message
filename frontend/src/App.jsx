import './App.css'
import { SignInButton, SignUpButton, UserButton, Show } from '@clerk/react'

function App() {


  return (
    <>
    <div style={{display:"flex", justifyContent:"center", alignItems:"center", height:"100vh"}}>
      <h1>iMessage</h1>
    </div>
    <div>
      <header >
        <Show when="signed-out">
          <SignInButton mode="modal" />
          <SignUpButton mode="modal" />
        </Show>
        <Show when="signed-in">
          <UserButton />
        </Show>
      </header>
    </div>
     
    </>
  )
}

export default App
