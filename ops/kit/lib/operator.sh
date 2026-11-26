#!/usr/bin/env bash
# @file   ops/lib/operator.sh
# @module ops
# @brief  The server operator's contact address, asked once and kept in one file for every
#         Seasonal installer (K85).
#
# Responsibility: sourced by an installer, which runs as root. `sk_operator_email [address]`
#                 prints the address to use (for TLS certificates and as the operator's contact):
#                 an address passed on (the installer's --email) wins, and is written to
#                 /etc/seasonal/operator.env as SK_OPERATOR_EMAIL when the file has none; else the
#                 file's is used; else, at a terminal, it is asked once and written; else it
#                 stops and names the file and the key. The file is root's, mode 0644 (the address
#                 is no secret), is read as text and never run, and its other lines are kept. An
#                 address that is not of a plain form is refused wherever it comes from. The only
#                 line that says an address is "using <address> from <file>", on stderr; no error
#                 says one. SK_OPERATOR_DIR names another folder (the tests).
# Depends on:     bash 4, coreutils
# Source:         new in the kit, for the --email of seasonal-bingo-royale and
#                 seasonal-mini-games ops/install.sh and the website's ACME_EMAIL.
# Spec:           kit DECISIONS K85; docs/OPERATIONS.md "The operator's address"

sk_operator_die() {
  printf 'operator address: %s\n' "$*" >&2
  return 1
}

sk_operator_file() { printf '%s/operator.env' "${SK_OPERATOR_DIR:-/etc/seasonal}"; }

# A plain address: no space, quote or shell character, a domain with a dot.
sk_operator_plain() {
  [[ $1 =~ ^[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+\.)+[A-Za-z]{2,}$ ]]
}

# The file's address as it stands (its last SK_OPERATOR_EMAIL line, quotes taken off), or
# nothing.
sk_operator_read() {
  local file value
  file=$(sk_operator_file)
  [[ -e $file ]] || return 0
  [[ -r $file ]] || { sk_operator_die "cannot read $file"; return 1; }
  value=$(sed -n 's/^SK_OPERATOR_EMAIL=//p' "$file" | tail -n 1 | tr -d '\r')
  value=${value#[\"\']}
  printf '%s' "${value%[\"\']}"
}

# Writes the address beside the file's other lines, whole or not at all.
sk_operator_write() {
  local file dir temp
  file=$(sk_operator_file)
  dir=${file%/*}
  # Made readable by all, whatever the installer's umask is.
  if [[ ! -d $dir ]] && ! install -d -m 0755 "$dir"; then
    sk_operator_die "cannot write $file (run as root)"
    return 1
  fi
  temp=$(mktemp "$file.XXXXXX") || { sk_operator_die "cannot write $file (run as root)"; return 1; }
  if {
    if [[ -e $file ]]; then sed '/^SK_OPERATOR_EMAIL=/d' "$file"; fi &&
      printf 'SK_OPERATOR_EMAIL=%s\n' "$1"
  } >"$temp" && chmod 0644 "$temp" && mv "$temp" "$file"; then
    return 0
  fi
  rm -f "$temp"
  sk_operator_die "cannot write $file"
}

sk_operator_using() { printf 'using %s from %s\n' "$1" "$(sk_operator_file)" >&2; }

# An address the installer was given.
sk_operator_given() {
  local stored
  sk_operator_plain "$1" || { sk_operator_die "the address passed is not a plain e-mail address"; return 1; }
  stored=$(sk_operator_read) || return 1
  [[ -n $stored ]] || sk_operator_write "$1" || return 1
  if [[ -z $stored || $stored == "$1" ]]; then
    sk_operator_using "$1"
  else
    printf 'using the address passed, not the one in %s\n' "$(sk_operator_file)" >&2
  fi
  printf '%s\n' "$1"
}

# sk_operator_email [address]: prints the operator's address.
sk_operator_email() {
  local address file
  if [[ -n ${1:-} ]]; then
    sk_operator_given "$1"
    return
  fi
  file=$(sk_operator_file)
  address=$(sk_operator_read) || return 1
  if [[ -z $address ]]; then
    [[ -t 0 ]] ||
      { sk_operator_die "set SK_OPERATOR_EMAIL in $file, or pass --email to the installer."; return 1; }
    read -r -p "Operator e-mail (certificates and contact): " address
    sk_operator_plain "$address" || { sk_operator_die "that is not a plain e-mail address"; return 1; }
    sk_operator_write "$address" || return 1
  fi
  sk_operator_plain "$address" ||
    { sk_operator_die "SK_OPERATOR_EMAIL in $file is not a plain e-mail address"; return 1; }
  sk_operator_using "$address"
  printf '%s\n' "$address"
}
