#!/bin/bash
set -eo pipefail
trap 'jobs -p | xargs -r kill' SIGTERM

: ${NETWORK:=testnet}
: ${LIGHTNINGD_OPT:=--log-level=debug}
: ${BITCOIND_OPT:=-debug=rpc --printtoconsole=0}

[[ "$NETWORK" == "mainnet" ]] && NETWORK=bitcoin

if [ -d /etc/lightning ]; then
  echo -n "Using lightningd directory mounted in /etc/lightning... "
  LN_PATH=/etc/lightning
  if [ ! -f $LN_PATH/lightningd.sqlite3 ] && [ -f $LN_PATH/$NETWORK/lightningd.sqlite3 ]; then
    echo -n "Using $LN_PATH/$NETWORK... "
    LN_PATH=$LN_PATH/$NETWORK
  fi
else

  # Setup bitcoind (only needed when we're starting our own lightningd instance)
  if [ -d /etc/bitcoin ]; then
    echo -n "Connecting to bitcoind configured in /etc/bitcoin... "

    RPC_OPT="-datadir=/etc/bitcoin $([[ -z "$BITCOIND_RPCCONNECT" ]] || echo "-rpcconnect=$BITCOIND_RPCCONNECT")"

  elif [ -n "$BITCOIND_URI" ]; then
    [[ "$BITCOIND_URI" =~ ^[a-z]+:\/+(([^:/]+):([^@/]+))@([^:/]+:[0-9]+)/?$ ]] || \
      { echo >&2 "ERROR: invalid bitcoind URI: $BITCOIND_URI"; exit 1; }

    echo -n "Connecting to bitcoind at ${BASH_REMATCH[4]}... "

    RPC_OPT="-rpcconnect=${BASH_REMATCH[4]}"

    if [ "${BASH_REMATCH[2]}" != "__cookie__" ]; then
      RPC_OPT="$RPC_OPT -rpcuser=${BASH_REMATCH[2]} -rpcpassword=${BASH_REMATCH[3]}"
    else
      RPC_OPT="$RPC_OPT -datadir=/tmp/bitcoin"
      [[ "$NETWORK" == "bitcoin" ]] && NET_PATH=/tmp/bitcoin || NET_PATH=/tmp/bitcoin/$NETWORK
      mkdir -p $NET_PATH
      echo "${BASH_REMATCH[1]}" > $NET_PATH/.cookie
    fi

  else
    echo -n "Starting bitcoind... "

    mkdir -p /data/bitcoin
    RPC_OPT="-datadir=/data/bitcoin"

    if [ "$NETWORK" != "bitcoin" ]; then
      BITCOIND_NET_OPT="-$NETWORK"
    fi

    bitcoind $BITCOIND_NET_OPT $RPC_OPT $BITCOIND_OPT &
    echo -n "waiting for cookie... "
    sed --quiet '/^\.cookie$/ q' <(inotifywait -e create,moved_to --format '%f' -qmr /data/bitcoin)
  fi

  echo -n "waiting for RPC... "
  bitcoin-cli $BITCOIND_NET_OPT $RPC_OPT -rpcwait getblockchaininfo > /dev/null
  echo "ready."

  # Setup lightning
  echo -n "Starting lightningd... "

  LN_BASE=/data/lightning
  mkdir -p $LN_BASE

  lnopt=($LIGHTNINGD_OPT --network=$NETWORK --lightning-dir=$LN_BASE --log-file=debug.log)
  [[ -z "$LN_ALIAS" ]] || lnopt+=(--alias="$LN_ALIAS")

  lightningd "${lnopt[@]}" $(echo "$RPC_OPT" | sed -r 's/(^| )-/\1--bitcoin-/g') > /dev/null &

  LN_PATH=$LN_BASE/$NETWORK
  mkdir -p $LN_PATH
fi

if [ ! -S $LN_PATH/lightning-rpc ] || ! echo | nc -q0 -U $LN_PATH/lightning-rpc; then
  echo -n "waiting for RPC unix socket... "
  sed --quiet '/^lightning-rpc$/ q' <(inotifywait -e create,moved_to --format '%f' -qm $LN_PATH)
fi

# lightning-cli is unavailable in standalone mode, so we can't check the rpc connection.
# Spark itself also checks the connection when starting up, so this is not too bad.
if command -v lightning-cli > /dev/null; then
  # workaround for https://github.com/ElementsProject/lightning/issues/3352
  # (patch is on its way! but this will have to be kept around for v0.8.0 compatibility)
  mkdir -p /tmp/dummy /tmp/dummy/bitcoin
  lightning-cli --lightning-dir /tmp/dummy --rpc-file $LN_PATH/lightning-rpc getinfo > /dev/null
  echo -n "c-lightning RPC ready."
  rm -r /tmp/dummy
fi

mkdir -p $TOR_PATH/tor-installation/node_modules

if [ -z "$STANDALONE" ]; then
  # when not in standalone mode, run spark-wallet as an additional background job
  echo -e "\nStarting spark wallet..."
  spark-wallet -l $LN_PATH "$@" $SPARK_OPT &

  # shutdown the entire process when any of the background jobs exits (even if successfully)
  wait -n
  kill -TERM $$
else
  # in standalone mode, replace the process with spark-wallet
  echo -e "\nStarting spark wallet (standalone mode)..."
  exec spark-wallet -l $LN_PATH "$@" $SPARK_OPT
fi

