// utils/createTokenUser.js
const createTokenUser = (user) => {
  return {
    nom: user.nom,
    email: user.email,
    prenom: user.prenom,
    userId: user._id,
    role: user.role,
  }
}

export default createTokenUser
