import { Contract } from 'soroban-client'
import { SorobanServer, xdr } from '../stellar'
import { hexStringToBytes } from '../utils'

const API_URL = `https://steexp-api.fly.dev`

interface ContractProps {
    id: string
    wasmId: string
    wasmIdLedger: string
    wasmCode: string
    wasmCodeLedger: string
}

const getContractInfo = async (
    server: SorobanServer,
    contractId: string
) => {
    const ledgerKey = xdr.LedgerKey.contractData(
        new xdr.LedgerKeyContractData({
            contract: new Contract(contractId).address().toScAddress(),
            key: xdr.ScVal.scvLedgerKeyContractInstance(),
            durability: xdr.ContractDataDurability.persistent(),
            bodyType: xdr.ContractEntryBodyType.dataEntry()
        })
    )

    const ledgerEntries = await server.getLedgerEntries([ledgerKey])
    if (ledgerEntries == null || ledgerEntries.entries == null) {
        return null
    }

    const ledgerEntry = ledgerEntries.entries[0]
    const codeData = xdr.LedgerEntryData.fromXDR(ledgerEntry.xdr, 'base64')
        .contractData().body().data()

    const wasmIdLedger = ledgerEntry.lastModifiedLedgerSeq

    const contractInstance = codeData.val().instance()
    const wasmId = contractInstance.executable().wasmHash()
    const storage = contractInstance.storage()

    return { wasmId, wasmIdLedger, storage }
}

const getContractCode = async (
    server: SorobanServer,
    wasmId: Buffer
) => {
    const ledgerKey = xdr.LedgerKey.contractCode(
        new xdr.LedgerKeyContractCode({
            hash: wasmId,
            bodyType: xdr.ContractEntryBodyType.dataEntry()
        })
    )
    const ledgerEntries = await server.getLedgerEntries([ledgerKey])
    if (ledgerEntries == null || ledgerEntries.entries == null) {
        return null
    }
    const ledgerEntry = ledgerEntries.entries[0]

    const wasmCodeLedger = ledgerEntry.lastModifiedLedgerSeq as number

    const codeEntry = xdr.LedgerEntryData.fromXDR(ledgerEntry.xdr, 'base64')
    const wasmCode = codeEntry.contractCode().body().code()

    return { wasmCode, wasmCodeLedger }
}


const loadContract = async (
    server: SorobanServer,
    contractId: string
): Promise<ContractProps | undefined> => {
    let contractInstance
    try {
        contractInstance = new Contract(contractId)
    } catch (error) {
        console.error(`CONTRACT NOT FOUND`)
        return
    }

    const wasmIdResult = await getContractInfo(
        server,
        contractId
    )
    if (wasmIdResult == null) {
        console.error('Failed to get wasm id')
        return
    }

    const { wasmId, wasmIdLedger } = wasmIdResult
    if (!wasmId) {
        console.error('Failed to get wasm id')
        return
    }

    // TODO: render storage

    const codeResult = await getContractCode(
        server,
        wasmId
    )
    if (!codeResult) {
        console.error('Failed to get wasm code')
        return
    }
    const { wasmCode, wasmCodeLedger } = codeResult

    return {
        id: contractInstance.contractId(),
        wasmId: wasmId.toString('hex'),
        wasmIdLedger: String(wasmIdLedger),
        wasmCode: wasmCode.toString('hex'),
        wasmCodeLedger: String(wasmCodeLedger),
    }
}

const getContractDecompiled = (wasmHexString: string): Promise<string> => {
    const wasmBytes = hexStringToBytes(wasmHexString)
    const blob = new Blob([new Uint8Array(wasmBytes)])
    const formData = new FormData()
    formData.append('contract', blob, 'contract.wasm')
    return fetch(`${API_URL}/decompile`, {
        method: 'POST',
        body: formData
    }).then(response => response.text())
}

export type { ContractProps }

export {
    getContractCode,
    getContractInfo,
    getContractDecompiled,
    loadContract
}