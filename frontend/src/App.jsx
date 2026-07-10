
import { SignInButton, SignUpButton, UserButton, Show } from '@clerk/react'

function App() {


  return (
    <>
    <div className="text-3xl font-bold underline justify-center">
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
