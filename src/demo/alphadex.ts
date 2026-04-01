/**
 * Alphadex string ↔ number conversion (demo helper for the alphadex dimensional example).
 */
export const convertAlphadex = (numberLetterInput: string): number => {
  const [input, decimalRaw] = numberLetterInput.split('.')
  const decimalFloat = parseFloat(`0.${decimalRaw}`)
  const decimal = Number.isNaN(decimalFloat) ? 0 : decimalFloat
  let letter: string | null = null
  let nthAlphabet = 0
  let negative = false
  if (input[0] === '-') {
    letter = input[1]
    nthAlphabet = input.length - 2
    negative = true
  } else {
    letter = input[0]
    nthAlphabet = input.length - 1
  }
  const alphabet = 'abcdefghijklmnopqrstuvwxyz'
  const rawIndex = alphabet.indexOf(letter!.toLowerCase())
  const integer = rawIndex + nthAlphabet * alphabet.length

  let final: number = -1
  if (negative) {
    final = 0 - (integer + decimal)
  } else {
    final = integer + decimal
  }
  return final
}

export const numberToAlphadex = (signedNumber: number): string => {
  const number = Math.abs(signedNumber)
  const isNeg = number !== signedNumber
  const roundedToTenths = Math.round(number * 10) / 10
  const alphabet = 'abcdefghijklmnopqrstuvwxyz'
  const letter = alphabet[Math.floor(roundedToTenths) % alphabet.length]
  const nthAlphabet = Math.floor(roundedToTenths / alphabet.length)
  const letterString = letter.repeat(nthAlphabet + 1)
  const decimal = roundedToTenths - Math.floor(roundedToTenths)
  const roundedDecimal = Math.round(decimal * 10) / 10
  return `${isNeg ? '-' : ''}${letterString}${roundedDecimal === 0 ? `.0` : roundedDecimal}`.replace(
    '0.',
    '.'
  )
}
