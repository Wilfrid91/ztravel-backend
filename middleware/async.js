export const asyncWrapper = (myFunction) => {
  return async (req, res, next) => {
    try {
      await myFunction(req, res, next)
    } catch (error) {
      next(error)
    }
  }
}
