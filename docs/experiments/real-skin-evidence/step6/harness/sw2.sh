for P in "$@"; do for f in ${FACES:-5k}; do r=$(node run3.mjs $f "$P" 2>&1); echo "== $f $P"; echo "$r" | grep -v "^$" | tail -11 | cut -c1-260; done; done
