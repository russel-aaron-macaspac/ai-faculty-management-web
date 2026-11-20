import crypto from 'node:crypto';

export function generateTemporaryPassword(length = 16): string {
  const groups = [
    'ABCDEFGHJKLMNPQRSTUVWXYZ',
    'abcdefghijkmnopqrstuvwxyz',
    '23456789',
    '!@#$%_-',
  ];
  const allCharacters = groups.join('');
  const passwordCharacters = groups.map((characters) =>
    characters[crypto.randomInt(characters.length)]
  );

  while (passwordCharacters.length < length) {
    passwordCharacters.push(allCharacters[crypto.randomInt(allCharacters.length)]);
  }

  for (let index = passwordCharacters.length - 1; index > 0; index -= 1) {
    const swapIndex = crypto.randomInt(index + 1);
    [passwordCharacters[index], passwordCharacters[swapIndex]] =
      [passwordCharacters[swapIndex], passwordCharacters[index]];
  }

  return passwordCharacters.join('');
}
