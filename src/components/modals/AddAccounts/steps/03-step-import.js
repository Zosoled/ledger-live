// @flow

import invariant from 'invariant'
import styled from 'styled-components'
import React, { PureComponent, Fragment } from 'react'
import type { Account } from '@ledgerhq/live-common/lib/types'
import uniq from 'lodash/uniq'

import { getBridgeForCurrency } from 'bridge'

import TrackPage from 'analytics/TrackPage'
import Box from 'components/base/Box'
import CurrencyBadge from 'components/base/CurrencyBadge'
import Button from 'components/base/Button'
import AccountsList from 'components/base/AccountsList'
import IconExclamationCircleThin from 'icons/ExclamationCircleThin'
import TranslatedError from '../../../TranslatedError'
import Spinner from '../../../base/Spinner'

import type { StepProps } from '../index'

const LoadingRow = styled(Box).attrs({
  horizontal: true,
  borderRadius: 1,
  px: 3,
  align: 'center',
  justify: 'center',
  mt: 1,
})`
  height: 48px;
  border: 1px dashed ${p => p.theme.colors.grey};
`

class StepImport extends PureComponent<StepProps> {
  componentDidMount() {
    this.props.setScanStatus('scanning')
  }

  componentDidUpdate(prevProps: StepProps) {
    const didStartScan = prevProps.scanStatus !== 'scanning' && this.props.scanStatus === 'scanning'
    const didFinishScan =
      prevProps.scanStatus !== 'finished' && this.props.scanStatus === 'finished'

    // handle case when we click on retry sync
    if (didStartScan) {
      this.startScanAccountsDevice()
    }

    // handle case when we click on stop sync
    if (didFinishScan) {
      this.unsub()
    }
  }

  componentWillUnmount() {
    this.unsub()
  }

  scanSubscription = null

  unsub = () => {
    if (this.scanSubscription) {
      this.scanSubscription.unsubscribe()
    }
  }

  translateName(account: Account) {
    const { t } = this.props
    let { name } = account

    if (name === 'New Account') {
      name = t('app:addAccounts.newAccount')
    } else if (name.indexOf('legacy') !== -1) {
      name = t('app:addAccounts.legacyAccount', { accountName: name.replace(' (legacy)', '') })
    }

    return {
      ...account,
      name,
    }
  }

  startScanAccountsDevice() {
    this.unsub()
    const { currency, device, setScanStatus, setScannedAccounts } = this.props
    try {
      invariant(currency, 'No currency to scan')
      invariant(device, 'No device')

      const bridge = getBridgeForCurrency(currency)

      // TODO: use the real device
      const devicePath = device.path

      this.scanSubscription = bridge.scanAccountsOnDevice(currency, devicePath).subscribe({
        next: account => {
          const { scannedAccounts, checkedAccountsIds, existingAccounts } = this.props
          const hasAlreadyBeenScanned = !!scannedAccounts.find(a => account.id === a.id)
          const hasAlreadyBeenImported = !!existingAccounts.find(a => account.id === a.id)
          const isNewAccount = account.operations.length === 0
          if (!hasAlreadyBeenScanned) {
            setScannedAccounts({
              scannedAccounts: [...scannedAccounts, this.translateName(account)],
              checkedAccountsIds:
                !hasAlreadyBeenImported && !isNewAccount
                  ? uniq([...checkedAccountsIds, account.id])
                  : checkedAccountsIds,
            })
          }
        },
        complete: () => setScanStatus('finished'),
        error: err => setScanStatus('error', err),
      })
    } catch (err) {
      setScanStatus('error', err)
    }
  }

  handleRetry = () => {
    this.unsub()
    this.props.resetScanState()
    this.startScanAccountsDevice()
  }

  handleToggleAccount = (account: Account) => {
    const { checkedAccountsIds, setScannedAccounts } = this.props
    const isChecked = checkedAccountsIds.find(id => id === account.id) !== undefined
    if (isChecked) {
      setScannedAccounts({ checkedAccountsIds: checkedAccountsIds.filter(id => id !== account.id) })
    } else {
      setScannedAccounts({ checkedAccountsIds: [...checkedAccountsIds, account.id] })
    }
  }

  handleSelectAll = (accountsToSelect: Account[]) => {
    const { setScannedAccounts, checkedAccountsIds } = this.props
    setScannedAccounts({
      checkedAccountsIds: uniq(checkedAccountsIds.concat(accountsToSelect.map(a => a.id))),
    })
  }

  handleUnselectAll = (accountsToRemove: Account[]) => {
    const { setScannedAccounts, checkedAccountsIds } = this.props
    setScannedAccounts({
      checkedAccountsIds: checkedAccountsIds.filter(id => !accountsToRemove.some(a => id === a.id)),
    })
  }

  renderError() {
    const { err, t } = this.props
    invariant(err, 'Trying to render inexisting error')
    return (
      <Box
        style={{ height: 200 }}
        px={5}
        textAlign="center"
        align="center"
        justify="center"
        color="alertRed"
      >
        <IconExclamationCircleThin size={43} />
        <Box mt={4}>{t('app:addAccounts.somethingWentWrong')}</Box>
        <Box mt={4}>
          <TranslatedError error={err} />
        </Box>
      </Box>
    )
  }

  render() {
    const {
      scanStatus,
      currency,
      err,
      scannedAccounts,
      checkedAccountsIds,
      existingAccounts,
      setAccountName,
      editedNames,
      t,
    } = this.props

    if (err) {
      // TODO prefer rendering a component
      return this.renderError()
    }

    const currencyName = currency ? currency.name : ''

    const importedAccounts = []
    const importableAccounts = []
    const creatableAccounts = []
    let alreadyEmptyAccount
    scannedAccounts.forEach(acc => {
      const existingAccount = existingAccounts.find(a => a.id === acc.id)
      const empty = acc.operations.length === 0
      if (existingAccount) {
        importedAccounts.push(existingAccount)
        if (empty) {
          alreadyEmptyAccount = existingAccount
        }
      } else if (empty) {
        creatableAccounts.push(acc)
      } else {
        importableAccounts.push(acc)
      }
    })

    const importableAccountsListTitle = t('app:addAccounts.accountToImportSubtitle', {
      count: importableAccounts.length,
    })

    const importedAccountsListTitle = t('app:addAccounts.accountAlreadyImportedSubtitle', {
      count: importableAccounts.length,
    })

    const importableAccountsEmpty = t('app:addAccounts.noAccountToImport', { currencyName })

    const shouldShowNew = scanStatus !== 'scanning'

    return (
      <Fragment>
        <TrackPage category="AddAccounts" name="Step3" />
        <Box mt={-4}>
          {importedAccounts.length === 0 ? null : (
            <AccountsList
              title={importedAccountsListTitle}
              accounts={importedAccounts}
              editedNames={editedNames}
              collapsible
            />
          )}
          {importableAccounts.length === 0 ? null : (
            <AccountsList
              title={importableAccountsListTitle}
              emptyText={importableAccountsEmpty}
              accounts={importableAccounts}
              checkedIds={checkedAccountsIds}
              onToggleAccount={this.handleToggleAccount}
              setAccountName={setAccountName}
              editedNames={editedNames}
              onSelectAll={this.handleSelectAll}
              onUnselectAll={this.handleUnselectAll}
              autoFocusFirstInput
            />
          )}
          {!shouldShowNew ? null : (
            <AccountsList
              autoFocusFirstInput={importableAccounts.length === 0}
              title={t('app:addAccounts.createNewAccount.title')}
              emptyText={
                alreadyEmptyAccount
                  ? t('app:addAccounts.createNewAccount.noOperationOnLastAccount', {
                      accountName: alreadyEmptyAccount.name,
                    })
                  : t('app:addAccounts.createNewAccount.noAccountToCreate', { currencyName })
              }
              accounts={creatableAccounts}
              checkedIds={checkedAccountsIds}
              onToggleAccount={this.handleToggleAccount}
              setAccountName={setAccountName}
              editedNames={editedNames}
            />
          )}
          {scanStatus === 'scanning' ? (
            <LoadingRow>
              <Spinner color="grey" size={16} />
            </LoadingRow>
          ) : null}
        </Box>

        {err && <Box shrink>{err.message}</Box>}
      </Fragment>
    )
  }
}

export default StepImport

export const StepImportFooter = ({
  transitionTo,
  setScanStatus,
  scanStatus,
  onClickAdd,
  onCloseModal,
  checkedAccountsIds,
  scannedAccounts,
  currency,
  t,
}: StepProps) => {
  const willCreateAccount = checkedAccountsIds.some(id => {
    const account = scannedAccounts.find(a => a.id === id)
    return account && account.operations.length === 0
  })

  const willAddAccounts = checkedAccountsIds.some(id => {
    const account = scannedAccounts.find(a => a.id === id)
    return account && account.operations.length > 0
  })

  const count = checkedAccountsIds.length

  const ctaWording =
    scanStatus === 'scanning'
      ? t('app:common.sync.syncing')
      : t('app:addAccounts.cta.add', { count })

  const willClose = !willCreateAccount && !willAddAccounts
  const onClick = willClose
    ? onCloseModal
    : async () => {
        await onClickAdd()
        transitionTo('finish')
      }

  return (
    <Fragment>
      {currency && <CurrencyBadge mr="auto" currency={currency} />}
      {scanStatus === 'error' && (
        <Button mr={2} onClick={() => setScanStatus('scanning')}>
          {t('app:common.retry')}
        </Button>
      )}
      {scanStatus === 'scanning' && (
        <Button mr={2} onClick={() => setScanStatus('finished')}>
          {t('app:common.stop')}
        </Button>
      )}
      <Button
        primary
        disabled={
          (scanStatus !== 'finished' && scanStatus !== 'error') ||
          !(willCreateAccount || willAddAccounts)
        }
        onClick={onClick}
      >
        {ctaWording}
      </Button>
    </Fragment>
  )
}
