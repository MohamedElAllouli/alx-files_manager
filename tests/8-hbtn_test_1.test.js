import chai from 'chai';
import chaiHttp from 'chai-http';

import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';

import { MongoClient, ObjectID } from 'mongodb';
import { promisify } from 'util';
import redis from 'redis';
import sha1 from 'sha1';

chai.use(chaiHttp);

describe('GET /files/:id/data', () => {
    let testClientDb;

    let fileUser = null;
    let fileUserId = null;

    let initialUser = null;
    let initialUserId = null;

    let initialFileId = null;

    const folderTmpFilesManagerPath = process.env.FOLDER_PATH || '/tmp/files_manager';

    const fctRandomString = () => {
        return Math.random().toString(36).substring(2, 15);
    }
    const fctCreateTmp = () => {
        if (!fs.existsSync(folderTmpFilesManagerPath)) {
            fs.mkdirSync(folderTmpFilesManagerPath);
        }
    }
    const fctRemoveTmp = () => {
        if (fs.existsSync(folderTmpFilesManagerPath)) {
            fs.readdirSync(`${folderTmpFilesManagerPath}/`).forEach((i) => {
                fs.unlinkSync(`${folderTmpFilesManagerPath}/${i}`)
            })
        }
    }

    beforeEach(() => {
        const dbInfo = {
            host: process.env.DB_HOST || 'localhost',
            port: process.env.DB_PORT || '27017',
            database: process.env.DB_DATABASE || 'files_manager'
        };
        return new Promise((resolve) => {
            fctRemoveTmp();
            MongoClient.connect(`mongodb://${dbInfo.host}:${dbInfo.port}/${dbInfo.database}`, async (err, client) => {
                testClientDb = client.db(dbInfo.database);

                await testClientDb.collection('users').deleteMany({})
                await testClientDb.collection('files').deleteMany({})

                // Add 1 user
                initialUser = {
                    email: `${fctRandomString()}@me.com`,
                    password: sha1(fctRandomString())
                }
                const createdDocs = await testClientDb.collection('users').insertOne(initialUser);
                if (createdDocs && createdDocs.ops.length > 0) {
                    initialUserId = createdDocs.ops[0]._id.toString();
                }

                // Add 1 user owner of file
                fileUser = {
                    email: `${fctRandomString()}@me.com`,
                    password: sha1(fctRandomString())
                }
                const createdUserFileDocs = await testClientDb.collection('users').insertOne(fileUser);
                if (createdUserFileDocs && createdUserFileDocs.ops.length > 0) {
                    fileUserId = createdUserFileDocs.ops[0]._id.toString();
                }

                // Add 1 file
                fctCreateTmp();
                const fileLocalPath = `${folderTmpFilesManagerPath}/${uuidv4()}`;
                fs.writeFileSync(fileLocalPath, `Hello-${uuidv4()}`);

                const initialFile = {
                    userId: ObjectID(fileUserId),
                    name: fctRandomString(),
                    type: "file",
                    parentId: '0',
                    isPublic: false,
                    localPath: fileLocalPath
                };
                const createdFileDocs = await testClientDb.collection('files').insertOne(initialFile);
                if (createdFileDocs && createdFileDocs.ops.length > 0) {
                    initialFileId = createdFileDocs.ops[0]._id.toString();
                }

                resolve();
            });
        });
    });

    afterEach(() => {
        fctRemoveTmp();
    });

    it('GET /files/:id/data with an unpublished file linked to :id but user unauthenticated', (done) => {
        chai.request('http://localhost:5000')
            .get(`/files/${initialFileId}/data`)
            .end(async (err, res) => {
                chai.expect(err).to.be.null;
                chai.expect(res).to.have.status(404);

                const resError = res.body.error;
                chai.expect(resError).to.equal("Not found");

                done();
            });
    }).timeout(30000);
});
