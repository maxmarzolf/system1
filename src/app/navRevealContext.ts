import { createContext, useContext } from 'react'

export const NavRevealContext = createContext(false)

export const useNavReveal = () => useContext(NavRevealContext)
