import mongoose from 'mongoose'
import validator from 'validator'
import bcrypt from 'bcryptjs'

const UserSchema = new mongoose.Schema(
  {
    nom: {
      type: String,
      required: [true, 'Please provide a username'],
      minlength: 3,
      maxlength: 20,
      trim: true,
    },
    prenom: {
      type: String,
      required: [true, 'Please provide a username'],
      minlength: 3,
      maxlength: 20,
      trim: true,
    },
    email: {
      type: String,
      unique: true,
      trim: true,
      required: [true, 'Please provide email'],
      validate: {
        validator: validator.isEmail,
        message: 'Please provide valid email',
      },
    },
    password: {
      type: String,
      required: [true, 'Please provide password'],
      minlength: 6,
      trim: true,
    },
    role: {
      type: String,
      enum: ['admin', 'user'],
      default: 'user',
    },
    verificationToken: String,

    isVerified: {
      type: Boolean,
      default: false,
    },
    verified: Date,

    passwordToken: {
      type: String,
    },

    passwordTokenExpirationDate: {
      type: Date,
    },
    lastLogin: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      default: 'active',
    },
    cguAccepted: { type: Boolean, default: false },
    cguAcceptedAt: { type: Date },
  },
  { collection: 'User' },
)

// Exécute les fonctions avant de sauvegarder un utilisateur dans MongoDB
// Etape 1:
/* 
await User.create({
  email: 'john@test.com',
  password: '123456'
})
{
  email: 'john@test.com',
  password: '123456'
}
  
Etape 2: pre('save') => this pointe sur l'instance utilisateur :
this.email     // john@test.com
this.password  // 123456
Etape3: this.isModified('password') renvoie true car un nouveau document a été insérré
Etape4: const salt = await bcrypt.genSalt(10)
*/

UserSchema.pre('save', async function () {
  // console.log(this.modifiedPaths());
  // Si le mot de passe n’a pas été modifié, ne fais rien
  if (!this.isModified('password')) return
  const salt = await bcrypt.genSalt(10)
  // bcrypt.hash() est asynchrone et retourne une Promise, sans await, return une Promise { <pending> }
  this.password = await bcrypt.hash(this.password, salt)
})

// Méthode d'instance pour comparer les mots de passe
UserSchema.methods.comparePassword = async function (candidatePassword) {
  const isMatch = await bcrypt.compare(candidatePassword, this.password)
  return isMatch
}

// Export du modèle
const User = mongoose.model('User', UserSchema)
export default User
